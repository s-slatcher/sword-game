/** @type {HTMLCanvasElement} */


const canvas = document.getElementById("canvas1");
const canvas2 = document.createElement("canvas")
const pauseMenu = document.getElementById("pauseMenu")
const canvasContainer = document.getElementById("canvas-container")
const resumeButton = document.getElementById("resume-btn")
const startButton = document.getElementById("start-btn")
const ctx = canvas.getContext('2d',{ alpha: false });
const keyRecord = [];
const touchRecord = {};
let spritesLoaded = 0;
startButton.innerHTML = `Loading`

canvas.width = 1000;
canvas.height = 1000;
canvas2.width = 1000
canvas2.height = 1000
canvas.style.aspectRatio = 1/1

//cheats+testing --- normal settings for all is false
const loadBlankSprites = true;
const gameMuted = false;
const disableEnemyDamage = false;
const showElementsAtAnyDistance = false;
const stillMotion = true;

const randomSign = () => Math.random() >= 0.5 ? 1 : -1;
const randomValue = (a,b) => Math.random() * (b-a) + a
const randomInt = (a,b) => Math.floor(randomValue(a,b+1))
const round = (num,degree) => Math.floor(num*(Math.pow(10,degree))) / Math.pow(10,degree)
const square = (num) => Math.pow(num,2)
const randomColor = () => "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0")

const vectorMagnitude = (vector) => {
    const {x,y,z = 0} = vector
    return Math.sqrt(square(x) + square(y) + square(z))
} 
const dotProduct = (v1,v2) => {
    let dotProduct = v1.x*v2.x + v1.y*v2.y
    if (v1.z) dotProduct += v1.z * v2.z
    return dotProduct
}
const unitVector = (vector) => {
    const magntitude = vectorMagnitude(vector)
    const {x,y,z} = vector
    return {x: x/magntitude, y: y/magntitude, z: z/magntitude}
}
const vectorFromPoints = (vector1,vector2) => {
    return {x: vector2.x-vector1.x, y: vector2.y-vector1.y, z: vector2.z-vector1.z}
}
const vectorDeepCopy = (vector) => {
    return vectorFromPoints({x:0,y:0,z:0},vector)
}
const changeVectorLength = (vector, length) => {
    const unit = unitVector(vector)
    return {x: unit.x*length, y: unit.y*length, z: unit.z*length}
}

const pointInRectangle = function(x,y,w,h,x2,y2){
    if (x2 > x && x2 < x+w && y2 > y && y2 < y+h) return true
    else return false
}

const getMousePosition = (event, element) => { 
    let rect = element.getBoundingClientRect(); 
    let x = (event.clientX - rect.left) * (1000/ rect.width); 
    let y = (event.clientY - rect.top) * (1000/ rect.width); 
    return {x:x, y:y}
} 

loadSprites().then( (bitmaps) => {
        startButton.innerHTML = "Start Game"
        startButton.addEventListener('click',() => {   
        startButton.classList.add("disabled")
        canvas.requestFullscreen().then(newGame(bitmaps)); 
    })
})

function newGame(bitmaps){ 
    const game = new Game(ctx, canvas.width, canvas.height, bitmaps)
    animate(0,game);  
}

function animate(timestamp, game){
    game.update(timestamp, keyRecord, touchRecord)
    requestAnimationFrame((timestamp)=>{
        animate(timestamp, game)
    })
}

resumeButton.addEventListener('click', () => {
    canvas.requestFullscreen();
    resumeButton.classList.add("disabled")
})

window.addEventListener('keydown', (e) => {
    let key = e.key.length > 1 ? e.key : e.key.toLowerCase();
    if (keyRecord.indexOf(key) === -1) keyRecord.push(key)
    if (key === ' ' || key === 'Escape') e.preventDefault();
})
window.addEventListener('keyup', (e) => {
    let key = e.key.length > 1 ? e.key : e.key.toLowerCase();
    keyRecord.splice(keyRecord.indexOf(key),1)
})

document.addEventListener("touchstart", e => {
    [...e.touches].forEach((touch) => {
        let id = touch.identifier
        if (touch.identifier > 1) id = touch.identifier % 2
        touchRecord[`touch${id}`] = {
            x: [touch.pageX],
            y: [touch.pageY]
        }
    })
})
document.addEventListener("touchmove", e => {
    [...e.changedTouches].forEach(touch => {
        const id = touch.identifier 
        touchRecord[`touch${id}`].x.push(touch.pageX) 
        touchRecord[`touch${id}`].y.push(touch.pageY)  
        })
    })
document.addEventListener("touchend", e => {
    let id = [...e.changedTouches][0].identifier
    delete touchRecord[`touch${id}`]
})



class Game {
    static setPerspective(bottomY=canvas.height, perspectiveHeight=725, basesWidth=1000, startPercentage=0.22){
        Game.baseWidth = basesWidth
        Game.baseCenterX = canvas.width/2
        Game.height = perspectiveHeight
        Game.bottomY = bottomY
        Game.topY = Game.bottomY - Game.height
        Game.startPercentage = startPercentage 
        Game.startY = Game.topY + (Game.height * Game.startPercentage)
    }
    constructor(ctx, width, height, bitmaps){
        Game.setPerspective();
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.lastTimeStamp = 0;
        this.frameTimeDeficit = 0;
        this.totalFrames = 0;
        this.fps = 48;
        this.gameProgress = 0
        this.speedModifier = 1;
        this.activeObjects = []
        this.stats = {score:0, coins: 500, combo: 1}
        this.player = new Player(this, bitmaps.block, bitmaps.attack)
        this.statsHandler = new StatsHandler(this)
        this.inputHandler = new InputHandler()
        this.states = { initializing: new Initializing(this), playing: new Playing(this), paused: new Paused(this),
                        gameOver: new GameOver(this), gameCompletion: new GameCompletion(this) }
        this.state = this.states.initializing
        this.state.enter();
    }
    update(timestamp, keyRecord, touchRecord){
        const input = this.inputHandler.readInput(keyRecord, touchRecord)
        const framesDue = this.getFramesDue(timestamp)
        if (framesDue !== 0) {
            this.state.update(input)
            this.draw(this.ctx)
            this.statsHandler.update(this.stats)
            this.updateSpeedModifier()
        }
    }
    draw(ctx){
        this.state.draw(ctx)
    }
    changeState(state){
        this.state.exit();
        this.state = this.states[state]
        this.state.enter();
    }
    addScore(num){
        let score = num * this.stats.combo
        if (num > 5) this.stats.combo += 1
        this.stats.score += score
    }
    updateSpeedModifier(){
        let newSpeed = 1 + (Math.pow((this.stats.combo-1)/25, (2/3)))
        if (round(newSpeed,2) != this.speedModifier) {
            this.speedModifier = newSpeed
            this.player.moveSpeed = this.player.minimumSpeed * this.speedModifier
            this.setViewDistance(0.22 - ((1/16)*(newSpeed-1)))
        }
    }
    getFramesDue(timestamp){
        const frameTime = timestamp - this.lastTimeStamp
        this.frameTimeDeficit += frameTime;
        this.lastTimeStamp = timestamp;
        const framesDue = Math.floor(this.frameTimeDeficit / (1000/this.fps));
        this.frameTimeDeficit = this.frameTimeDeficit % (1000/this.fps);
        return framesDue;
    }
    setBaseStartPoint(y=1000){
        const difference = Game.bottomY - y
        Game.setPerspective(y,Game.height,Game.baseWidth,Game.startPercentage)
    }
    setViewDistance(startPercentage){
        Game.startPercentage = startPercentage
        Game.startY = Game.topY + (Game.height * Game.startPercentage)
    }
    changePerspectiveHeight(height){
        const heightDifference = Game.height-height
        this.player.moveSpeed = this.player.minimumSpeed * this.speedModifier * (height/Game.height)
        const baseAdjustment = heightDifference/3
        const ratio = (baseAdjustment+Game.baseWidth) / Game.baseWidth
        this.activeObjects.forEach((e)=> { if (!(e instanceof SkyLayer)) e.x *= ratio})
        Game.setPerspective(Game.bottomY,height,Game.baseWidth+baseAdjustment,Game.startPercentage)
    }
}


class GameState {
    constructor(game){
        this.game = game
        this.ctx = game.ctx
        this.width =  game.width
        this.height = game.height
    }
    enter(){}
    exit(){}
    update(){}
    draw(){}
}
class Paused extends GameState {
    constructor(game){
        super(game)
        document.addEventListener("mousedown", (event) => this.debugHighlight(event))
    }
    enter(){ 
        document.getElementById("resume-btn").classList.remove("disabled")
    }
    exit(){
    }
    update(input){ if (document.fullscreenElement) this.game.changeState("playing") } //fix this to have game start rules not based on fullscreen

    debugHighlight(event){
        if (this.game.state != this) return;
        const clickCoords = getMousePosition(event, canvas) 
        let endCycle = false
        this.game.activeObjects.filter(e=>{
            return (e instanceof Bush
                || e instanceof Enemy
                || e instanceof Projectile)
        }).toReversed().forEach( e => {
            if (endCycle) return;
            const color = randomColor()
            if (pointInRectangle(e.dx, e.dy, e.dw, e.dh, clickCoords.x, clickCoords.y)){
                endCycle = true
                e.image.drawOutline(ctx, color, e.dx, e.dy, e.dw, e.dh)
                console.log(`%c ${e.constructor.name}`, `color: ${color}; font-size: 30`, e)
            }
        })
        
    }
}
class Initializing extends GameState {
    constructor(game){
        super(game)
        this.ctx.font = "50px Lugrasimo"
    }
    enter(){
        for (let i = 0; i < 600; i++) {
            this.game.states.playing.handleBackground();
            this.game.player.moveObjectsCloser()
        }
        for (let i = 0; i < 7; i++) this.game.activeObjects.push(new SkyLayer(this.game,0+(i*50),i*100))
    }
    exit(){
        if (stillMotion) this.game.player.moveSpeed = 0;
    }
    update(input){ this.game.changeState("playing") }
    draw(ctx){ return }
    
}
class Playing extends GameState {
    constructor(game){
        super(game)
        this.framesSinceBowman = 0;
        this.treesDelay = 40;
        this.bowmanDelay = 0
        this.shadowCanvas = document.createElement("canvas")
        this.shadowCanvas.width = this.width
        this.shadowCanvas.height = this.height
        this.ctxShadow = this.shadowCanvas.getContext("2d")
        //document.onclick = e => { document.onclick = e => {this.testProjectile(e)} }
        this.createCannon();
    }
    update(input){
        if (!document.fullscreenElement) {
            this.game.changeState("paused")
            return
        } 
        this.game.totalFrames++;
        this.handleEnemies();
        this.handleBackground();
        this.handleCannon(input);
        this.game.activeObjects.forEach((e)=>e.update())
        this.game.player.update(input)
        this.game.activeObjects = this.game.activeObjects.filter((e)=>!e.markedForDel)
        this.game.activeObjects.sort((a,b)=> b.vector.z - a.vector.z)
        this.draw(this.ctx);   
    }
    testProjectile(){
        const projectiles = ["soccorBall","bowlingBall"]
        const int = randomInt(0,projectiles.length-1)
        const newProj = Projectile[projectiles[int]](this.game)
        this.game.activeObjects.push(newProj)
    }
    handleEnemies(){
        const startingDepth = 4200
        if (this.framesSinceBowman > this.bowmanDelay) this.spawnBowWave(startingDepth);
        else this.framesSinceBowman += this.game.speedModifier;
        if (this.game.player.health < 0.5) {
            if(Turkey.turkeySpawnable()) this.game.activeObjects.push(new Turkey(this.game,{x: 0, y: 0, z: 4000}))
        }
    }
    spawnBowWave(startingDepth){ 
        this.game.activeObjects.push(...Bowman.spawnWave(this.game,startingDepth,randomInt(2,3)))
        this.framesSinceBowman = 0
        this.bowmanDelay = 600
    }
    handleBackground(){
        if (this.treesDelay <= 0) {
            Tree.spawnWave(this.game)
            this.treesDelay += Math.floor(40/this.game.speedModifier)   //swap out for just checking if trees have traveled a certain depth from starting point
        } else this.treesDelay -= 1
        if (this.treesDelay === Math.floor(20/this.game.speedModifier)) {
            this.game.activeObjects.push(new Bush(this.game, 4000, randomValue(925,1025)*randomSign()))
        }
    }
    draw(){
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctxShadow.clearRect(0,0,this.width,this.height)
        this.drawStaticBackground(this.ctx);
        this.overlayShadows()
        let drawnCannon = false;
        this.game.activeObjects.forEach(e => {
            
            e.draw(this.ctx)
            if (e.vector.z < this.cannonFront.vector.z && !drawnCannon) {
                this.drawCannon(this.ctx)
                drawnCannon = true; 
            }
        })
        this.game.player.draw(this.ctx)
        this.game.statsHandler.draw(this.ctx)
    }
    overlayShadows(){
        this.game.activeObjects.forEach(e => e.drawShadow(this.ctxShadow))
        this.ctxShadow.clearRect(0, 0, this.width, Game.startY)
        this.ctx.globalAlpha = 0.5
        this.ctx.drawImage(this.shadowCanvas,0,0,this.width,this.height)
        this.ctx.globalAlpha = 1        
    }
    drawStaticBackground(ctx){
        ctx.fillStyle = '#439544'
        ctx.fillRect(0, 0, this.width, this.height)
        ctx.fillStyle = '#439544'
        ctx.fillRect(0, Game.startY, Game.baseCenterX*2, Game.bottomY-Game.startY)
        ctx.beginPath()
        const StartWidth = Game.startPercentage * Game.baseWidth
        ctx.moveTo(Game.baseCenterX - StartWidth/2, Game.startY)
        ctx.lineTo(Game.baseCenterX + StartWidth/2, Game.startY)
        ctx.lineTo(Game.baseCenterX + Game.baseWidth/2, Game.bottomY)
        ctx.lineTo(Game.baseCenterX - Game.baseWidth/2, Game.bottomY)
        ctx.closePath()
        ctx.fillStyle = "#cfbd86"
        ctx.fill();
    }
    //

    //

    //

    //
    handleCannon(input){
        if (input === 'up') this.cannonAngles[0] += Math.PI/100
        if (input === 'down') this.cannonAngles[0] -= Math.PI/100
        if (input === 'right') this.cannonAngles[1] += Math.PI/100
        if (input === 'left') this.cannonAngles[1] -= Math.PI/100
        if (input === 'arrowUp') this.cannonBack.vector.z += 10
        if (input === 'arrowDown') this.cannonBack.vector.z -= 10
        if (input === 'arrowRight') this.cannonBack.vector.x += 10
        if (input === 'arrowLeft') this.cannonBack.vector.x -= 10

        

        this.cannonAngles[0] = (this.cannonAngles[0] % (Math.PI * 2 * Math.sign(this.cannonAngles[0]))) || 0
        this.cannonAngles[1] = (this.cannonAngles[1] % (Math.PI * 2 * Math.sign(this.cannonAngles[1]))) || 0

        const magnitude = 300

        const eyelineVector = vectorFromPoints(this.cannonBack.centralVector, {x:0,y:Game.height,z:0})


        const visualBasePoint = changeVectorLength(eyelineVector, magnitude)
        const visualBaseAngles = []
        visualBaseAngles[0] = Math.asin(visualBasePoint.y / magnitude)
        const base = Math.abs(Math.cos(visualBaseAngles[0]) * magnitude)
        visualBaseAngles[1] = Math.asin(visualBasePoint.z / base)
        // console.log("angle from center to eyes:", visualBaseAngles)
        // console.log("angle from center to front:", this.cannonAngles)
        
       
        const yMag = Math.sin(this.cannonAngles[0]) * magnitude
        this.baseMagnitude = Math.abs(Math.cos(this.cannonAngles[0]) * magnitude)
        const zMag = Math.sin(this.cannonAngles[1]) * this.baseMagnitude
        const xMag = Math.cos(this.cannonAngles[1]) * this.baseMagnitude

    
        this.angleOfVisibility = Math.acos(
            (dotProduct(visualBasePoint,{x:xMag,y:yMag,z:zMag}))
            / (vectorMagnitude(visualBasePoint)*vectorMagnitude({x:xMag,y:yMag,z:zMag})))
        

        const vector = vectorDeepCopy(this.cannonBack.centralVector)
        vector.x += xMag 
        vector.y += yMag - this.cannonFront.image.height/2
        vector.z += zMag
        
        // vector.x = visualBasePoint.x + this.cannonBack.centralVector.x
        // vector.y = visualBasePoint.y + this.cannonBack.centralVector.y - this.cannonFront.image.height/2
        // vector.z = visualBasePoint.z + this.cannonBack.centralVector.z 
        this.cannonFront.vector = vector
     
    }
    drawCannon(ctx){
        ctx.strokeStyle = 'grey'
        let clockwise = true;
            // issue with this radius calc is it assumes you are looking head on, a better version would use the perspective of the player.
            let minorRadius = (this.cannonFront.dw/2) * Math.abs(Math.cos(this.angleOfVisibility))
            let radius = this.cannonFront.dw/2 
            let radius2 = this.cannonBack.dw/2
            let rotation = Math.atan((this.cannonFront.centerY-this.cannonBack.centerY)/(this.cannonFront.centerX - this.cannonBack.centerX)) + 1.571

        const drawCannonBack = () => {
            ctx.beginPath();
            ctx.arc(this.cannonBack.centerX, this.cannonBack.centerY, this.cannonBack.dw/2, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'grey'
            ctx.fill()
            ctx.strokeStyle = 'dimgrey'
            ctx.lineWidth = 3 * this.cannonBack.perspectiveScale
            ctx.stroke()
            ctx.closePath();
            }
        const drawCannonFront = () => {
            ctx.beginPath();
            if (this.cannonAngle2D < 0) clockwise = false
            ctx.ellipse(this.cannonFront.centerX, this.cannonFront.centerY, radius,
                        minorRadius, rotation, 0, Math.PI*2, clockwise)
            ctx.fillStyle = 'black'
            if (this.angleOfVisibility >1.517) ctx.fillStyle = 'grey'
            
            ctx.fill()
            ctx.lineWidth = 14 * this.cannonFront.perspectiveScale
            ctx.strokeStyle = 'grey'
            ctx.stroke() 
            ctx.closePath();
        } 
        
        const drawCannonBarrel = () => {
            const points = []
            let p1 = {}
            let p2 = {}
            let p3 = {}
            let p4 = {}
            p1.x = this.cannonFront.centerX + (Math.cos(rotation) * radius * 1.1) 
            p1.y = this.cannonFront.centerY + (Math.sin(rotation) * radius * 1.1)
            p2.x = this.cannonFront.centerX - (Math.cos(rotation) * radius * 1.1)
            p2.y = this.cannonFront.centerY - (Math.sin(rotation) * radius * 1.1)
            p3.x = this.cannonBack.centerX + (Math.cos(rotation) * radius2)
            p3.y = this.cannonBack.centerY + (Math.sin(rotation) * radius2)
            p4.x = this.cannonBack.centerX - (Math.cos(rotation) * radius2)
            p4.y = this.cannonBack.centerY - (Math.sin(rotation) * radius2)
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p3.x,p3.y)
            ctx.lineTo(p4.x,p4.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.lineTo(p1.x,p1.y)
            ctx.fillStyle = 'grey'
            
            ctx.fill()
            
            ctx.closePath()
        } 
            drawCannonBack()
            drawCannonBarrel()
            drawCannonFront()
            
    }
    createCannon(){
        this.cannonFront = new GameObj(this.game, new GameImage(undefined,100,100),{x:0,y:0,z:0})
        this.cannonBack = new GameObj(this.game, new GameImage(undefined,250,250),{x:0,y:0,z:700})
        
        this.cannonAngles = [0,3*Math.PI/2]
        // this.game.activeObjects.push(this.cannonFront)
        // this.game.activeObjects.push(this.cannonBack)
        
        this.playerToCannonAngles = []
        document.onclick = () => { 
            const ball = Projectile.bowlingBall(this.game)
            ball.vector = this.cannonFront.centralVector
            ball.velocity = changeVectorLength((vectorFromPoints(this.cannonBack.centralVector, this.cannonFront.centralVector)),50) 
            this.game.activeObjects.push(ball)

        }
    }    
}
class GameOver extends GameState {
    constructor(game){
        super(game)
    }
    enter(){
        
    }
    update(input){
        
    }
}
class GameCompletion extends GameState {
    constructor(game){
        super(game)

    }
    update(input){
        
    }
}

class GameImage {
    constructor(fileSrc, width, height, x = 0, y = 0){
        this.image = new Image()
        this.image.src = fileSrc
        this.width = width
        this.height = height
        this.x = x
        this.y = y
        this.alpha = 1
        this.angle = 0
        this.flipped = false
    }
    draw(ctx, x = this.x + Game.baseCenterX - this.width/2 , 
        y = Game.bottomY - this.y - this.height, 
        width = this.width, height = this.height){
        const {alpha,angle,flipped} = this
        if (alpha < 1 || angle !== 0 || flipped) {
            ctx.save()
            this.rotate(ctx,x+width/2,y+height/2)
            this.flipHorizontal(ctx,x+width/2,0)
            ctx.globalAlpha = this.alpha
        }
        if (this.image.currentSrc === "http://192.168.2.39:5501/images/coin_pile/1.png") console.log(this, x,y,width,height)
        if (alpha !== 0 && this.image) ctx.drawImage(this.image, x, y, width, height)
        ctx.restore()
    }
    fadeAlpha(increment){
        let alpha = this.alpha + increment
        if (alpha > 1) alpha = 1;
        if (alpha < 0) alpha = 0;
        this.alpha = alpha;
    }
    rotate(ctx,x,y){
        if (this.angle === 0) return; 
        ctx.translate(x,y)
        ctx.rotate(this.angle)
        ctx.translate(-x,-y)
    }
    flipHorizontal(ctx,x,y){
        if (!this.flipped) return;
        ctx.translate(x,y)
        ctx.scale(-1,1)
        ctx.translate(-x,y)
    }
    drawOutline(ctx,color, x, y, w, h){
        if (this instanceof Tree) return;
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.strokeRect(x, y ,w, h)
        ctx.restore()
    }
}

class GameObj {
    constructor(game, gameImage, basePoint){
        this.game = game
        this.image = gameImage
        this.vector = vectorDeepCopy(basePoint)
        this.relativeSpeed = 0
        this.markedForDel = false;
        this.shadow = new Image()
        this.shadow.src = "./images/shadow_small.png"
    }
    get perspectiveScale(){return 1 - (this.vector.z / (this.vector.z + Game.height))}

    get dw(){return this.image.width * this.perspectiveScale}
    get dh(){return this.image.height * this.perspectiveScale}
    get dy(){return Game.bottomY - (this.vector.z * this.perspectiveScale) - (this.vector.y * this.perspectiveScale) - this.dh}
    get dx(){return Game.baseCenterX - (this.dw/2) + (this.vector.x * this.perspectiveScale)}

    get centralVector(){return {x: this.vector.x, y: this.vector.y + this.image.height/2, z: this.vector.z}}
    get centerX(){return this.dx+this.dw/2 }   
    get centerY(){return this.dy+this.dh/2 }
    get imageGroundY(){return Game.bottomY - (this.vector.z * this.perspectiveScale)}

    get lane(){
            if (this.vector.x < -50) return "left"
            if (this.vector.x > 50) return "right"
            return "middle"
        }
    draw(ctx){        
        if (this.imageGroundY < Game.startY && !showElementsAtAnyDistance) return;
        const {dx, dy, dw, dh} = this;
        this.image.draw(ctx,(dx), (dy), (dw), (dh))

    }
    update(){}
    drawShadow(ctx, shadowImg, widthMultiplier){
        if (this.imageGroundY < Game.startY) return;
        if (!shadowImg) return;
        const width = this.dw * widthMultiplier
        const height = width * 0.3
        const y = this.imageGroundY - (height/1.8)
        ctx.drawImage(shadowImg, Math.floor((this.centerX-width*0.5)+0.5), y, Math.floor(width+0.5), Math.floor(height+0.5))
    }
    swapGameImage(gameImage){
        this.image = gameImage
    }
    depthFromProjectedDistance(num){
        return num / (1-(num/Game.height))
    }
}

class InputHandler {
    constructor(){}
    readInput(keyRecord, touchRecord){
        if (Object.keys(touchRecord).length === 0) return this.readKeyboardInput(keyRecord)
        else return this.readTouchInput(touchRecord)
    }
    readKeyboardInput(keyRecord){
        let input = 'middle'
        if (keyRecord.includes('a')) input = 'left'
        if (keyRecord.includes('d')) input = 'right'
        if (keyRecord.includes('a') && keyRecord.includes('d')) input = 'middle'
        if (keyRecord.includes(' ')) input = 'attack'
        if (keyRecord.includes('s')) input = 'down'
        if (keyRecord.includes('w')) input = 'up'
        if (keyRecord.includes('ArrowUp')) input = 'arrowUp'
        if (keyRecord.includes('ArrowDown')) input = 'arrowDown'
        if (keyRecord.includes('ArrowLeft')) input = 'arrowLeft'
        if (keyRecord.includes('ArrowRight')) input = 'arrowRight'
        return input
    }
    readTouchInput(touchRecord){
        const touch0 = touchRecord.touch0
        const touch1 = touchRecord.touch1
        const lastTouch = touch1 || touch0
        const lastTouchX = lastTouch.x[lastTouch.x.length-1]
        let input = 'middle'
        if (lastTouchX < window.innerWidth/3) input = 'left'
        if (lastTouchX > window.innerWidth*(2/3)) input = 'right'
        if (touchRecord.touch0 && touchRecord.touch1) input = 'middle'
        if ((touch0 && touch0.y[touch0.y.length-2] - touch0.y[touch0.y.length-1] > 15) ||
            (touch1 && touch1.y[touch1.y.length-2] - touch1.y[touch1.y.length-1] > 15)) input = 'attack'
        return input
    }
}

class StatsHandler {
    constructor(game){
        this.game = game
        this.scoreDisplay = new IncrementingText(GameText.standardStroked("0",500,100),0.5)
        this.comboDisplay = GameText.standardStroked(`ₓ1`,750,100)
        this.coinsNumDisplay = GameText.standardStroked("0",250,100)
        this.generateCoinImages()
        this.coinImage = 0;
    }
    update({score,coins,combo}){
        this.scoreDisplay.update(score)
        this.comboDisplay.content = `ₓ${combo}`
        this.coinsNumDisplay.content = `${coins}`
        this.updateCoinImage(coins)
    }
    draw(ctx){
        this.scoreDisplay.draw(ctx)
        this.comboDisplay.draw(ctx)
        this.coinsNumDisplay.draw(ctx)
        this.coinImages[this.coinImage].draw(ctx)
    }
    generateCoinImages(){
        this.coinImages = []
        this.coinImages.push(new GameImage("",0,0))
        for (let i = 0; i < 6; i++) {
            const imgSrc = `./images/coin_pile/${i+1}.png`
            this.coinImages
                .push(new GameImage(imgSrc,80,80,-340,890))
        }
    }
    updateCoinImage(coins){
        if (this.coinImage === 0 && coins > 0) this.coinImage = 1
        if (this.coinImage === 6) return;
        if (coins > Math.pow((this.coinImage+3),3)) this.coinImage++
    }

}

class GameText {
    static standardStroked(content,centerX,baseY){
        const font = "50px Lugrasimo"
        const stroke = 4
        return new GameText(content,font,centerX,baseY,stroke,"white","black")
    }
    static small(content,centerX,baseY){
        const font = "35px Lugrasimo"
        const stroke = 2
        return new GameText(content,font,centerX,baseY,stroke,"white","black")
    }
    static currentFont = "50px Lugrasimo"
    constructor(content,font,centerX,baseY,stroke,color,strokeColor){
        this.content = content 
        this.centerX = centerX
        this.baseY = baseY
        this.font = font
        this.stroke = stroke
        this.color = color
        this.strokeColor = strokeColor
    }
    draw(ctx){
        if (this.content === "") return;
        if (!this.dimensions) this.dimensions = ctx.measureText(this.content)
        const x = this.centerX - (this.dimensions.width/2)
        const y = this.baseY
        if (this.font !== GameText.currentFont) {
            ctx.font = this.font
            GameText.currentFont = this.font
        }
        if (this.stroke > 0){
            ctx.lineWidth = this.stroke
            ctx.strokeText(this.content,x,y)
        }
        ctx.fillStyle = this.color
        ctx.fillText(this.content,x,y)
    }
}

class IncrementingText {
    constructor(gameTextInstance,incrementSpeedFactor=0){
        if (isNaN(+gameTextInstance.content)) gameTextInstance.content = 0;
        this.text = gameTextInstance
        this.incrementSpeedFactor = incrementSpeedFactor
        this.incrementJumpPoint = 0.1*this.incrementSpeedFactor
        this.targetValue = +this.text.content
        this.currentValue = +this.text.content
        this.secondaryText = []
    }
    update(num){
        this.secondaryText.forEach(e=>e.update())
        if (this.targetValue !== num) this.generateSecondaryText(num)
        this.targetValue = num 
        const difference = this.targetValue - this.currentValue
        if (difference === 0) return;
        const sign = Math.sign(difference)
        const absDifference = Math.abs(difference)
        let increment = (Math.sqrt(absDifference)) * this.incrementSpeedFactor * sign
        if (Math.abs(increment) < this.incrementJumpPoint || Math.abs(increment) > absDifference) increment = difference
        this.currentValue += increment
        this.text.content = Math.floor(this.currentValue)
        this.text.dimensions = undefined;
    }
    generateSecondaryText(num){
        const difference = num - this.targetValue
        const content = `${difference < 0 ? "" : "+"}${difference}`
        const centerX = this.text.centerX + this.text.dimensions.width/2
        const baseY = this.text.baseY
        const secondaryText = AnimatedText.positive(GameText.small(content,centerX,baseY))
        this.secondaryText.push(secondaryText)
    }
    draw(ctx){
        this.text.draw(ctx)
        this.secondaryText.forEach(e=>e.draw(ctx))
    }
}

class AnimatedText {
    static positive(gameTextInstance){
        gameTextInstance.color = "white"
        return new AnimatedText(gameTextInstance,-8,12)
    }
    static negative(gameTextInstance){
        gameTextInstance.color = "red"
        return new AnimatedText(gameTextInstance,+8,12)
    }
    constructor(gameTextInstance,velY,movementFrameSpan){
        this.text = gameTextInstance
        this.velY = velY
        this.movementFrameSpan = movementFrameSpan
        this.framesActive = 0
        this.markedForDel = false;
    }
    update(){
        this.framesActive += 1
        if (this.framesActive > this.movementFrameSpan) return;
        this.text.baseY += this.velY
        this.velY *= 0.9
    }
    draw(ctx){
        if (this.framesActive > this.movementFrameSpan*1.5) return;
        this.text.draw(ctx)
    }
}

class GroundedObjects extends GameObj{
    constructor(game, gameImage, depth){
            super(game, gameImage, depth)
        }
    update(){
        if(this.vector.z < 100) this.image.fadeAlpha(-0.2)
        if(this.vector.z < -150) this.markedForDel = true; 
    }
}

class Tree extends GroundedObjects {
    static imageSources = [`./images/trees/tree_v3_1.png`,
                     `./images/trees/tree_v3_2.png`]

    static spawnWave(game){
        const tree1 = new Tree(game,4000,randomInt(1030,1070))
        const tree2 = new Tree(game,4000,-1 * randomInt(1030,1070))
        tree1.image.flipped = randomInt(0,1) === 1
        tree2.image.flipped = randomInt(0,1) === 1
        game.activeObjects.push(tree1,tree2)
     }
    constructor(game,depth,x){
        const scaler = randomValue(1.9,2.1)
        const size = {width: 1060 * scaler, height: 1090 * scaler}
        const picIndex = randomInt(1,6) === 2 ? 1 : 0
        const image = new GameImage(Tree.imageSources[picIndex], size.width, size.height)
        super(game, image, {x:x, y:-40, z:depth})
        this.shadow.src = `./images/tree_shadows_v2/${Math.floor(randomValue(1,7))}.png`
        this.shadowWidthMultiplier = randomValue(0.85,1)
    }
    update(){
        super.update()
    }
    drawShadow(ctx){
        super.drawShadow(ctx, this.shadow, this.shadowWidthMultiplier)
    }
    draw(ctx){
        super.draw(ctx)
    }
}

class Bush extends GroundedObjects {
    static imageSources = [`./images/bushes/1.png`, `./images/bushes/2.png`]
    static sideBias = 0
    constructor(game,depth,x){
        const scaler = randomValue(1.9,2.1)
        const size = {width: 240 * scaler, height: 150 * scaler}
        const picIndex = randomInt(0,1)
        const image = new GameImage(Bush.imageSources[picIndex], size.width, size.height)
        super(game, image, {x:x, y:0, z:depth})
        Bush.sideBias += Math.sign(x)
        if (Math.abs(Bush.sideBias) > 2) {
            this.vector.x *= -1
            Bush.sideBias = 0
        }
    }
    drawShadow(){}
}

class SkyLayer extends GameObj{
    static image = new GameImage("./images/sky_layers/skylayer3.png",2500,2500)
    constructor(game, startDepth, endOffset){
        super(game,SkyLayer.image, {x:0, y:0, z:startDepth})
        this.endOffset = endOffset
        this.image.alpha = showElementsAtAnyDistance ? 0 : 1
    }
    get destinationDepth(){
        return this.depthFromProjectedDistance(Game.bottomY - Game.startY) - this.endOffset
    }
    
    update(){
        let difference = (this.destinationDepth - this.vector.z)
        if (Math.abs(difference) < 10) return 
        let speed = difference*0.05 + this.game.player.moveSpeed
        this.vector.z += speed
    }
    drawShadow(){}
}


class Sprite extends GameObj{
    constructor(game, bitmaps, maxWidth, maxHeight, heightOffset = 0){
        const gameImage = new GameImage(undefined, maxWidth, maxHeight)
        super(game, gameImage, {x:0, y: heightOffset, z: 0})
        this.frame = 0;
        this.frames = []
        for (let i = 0; i < bitmaps.length; i++) {
            const frame = new GameImage(undefined, maxWidth, maxHeight)
            frame.image = bitmaps[i]
            this.frames.push(frame)
        }
        this.setFrame(this.frame)
    }
    incrementFrame(num){
        const newFrame = this.frame + Math.floor(num)
        this.setFrame(newFrame)
    }
    setFrame(frame){
        if (frame > this.frames.length-1) return;
        if (frame < 0) return;
        this.frame = frame;
        this.swapGameImage(this.frames[this.frame])
    }
}

class Projectile extends GameObj{
    static soccorBall(game){
        const image = new GameImage(`./images/football.png`,100,100)
        const ball = new Projectile(game,image, {x:0, y: 50, z: 0})
        ball.velocity = {x:randomInt(-10,10), y:randomInt(0,1) === 0 ? 30 : 5, z:15}
        ball.groundFriction *= 0.05
        ball.bounceDampening = -0.5 
        return ball
    }
    static bowlingBall(game) {
        const image = new GameImage(`./images/bowlingball.png`,90,90)
        const ball = new Projectile(game,image, {x:0,y:0,z:0})
        ball.velocity = {y:randomInt(0,1) === 0 ? 40 : 0, x:randomInt(-10,10), z:0}
        ball.velocity.z = ball.velocity.y > 0 ? 15 : 40
        ball.groundFriction *= 0.05
        ball.bounceDampening = 0.9
        return ball
    }
    constructor(game, gameImage, basePoint){
        super(game, gameImage, basePoint)
        this.game = game;
        this.velocity = {x:0,y:0,z:0}
        this.force = {x:0,y:-2,z:0} //-2.5 default to represent gravity
        this.borders = {x:[-750,750],y:[0,undefined], z:[undefined,2100]} //[lowerlimit, upper limit]
        this.rotationSpeed = 0
        this.mass = 1
        this.airFriction = 0.005
        this.groundFriction = 0.1
        this.bounceDampening = 0.5  // max 1 (negative value needed for infnite bouncing) 
        this.framesActive = 0
        this.frameLifeSpan = 1000
        this.relativeSpeed = 0
    }
    update(){
        const {velocity, vector, borders, force} = this
        const onGround = vector.y >= borders.y[1] && velocity.y === 0
        const deceleration = onGround ? this.groundFriction * this.mass : this.airFriction / this.mass
        for (const axis in velocity) {
            velocity[axis] *= 1-deceleration
            velocity[axis] += force[axis]
            vector[axis] += velocity[axis] 
            borders[axis].forEach((border,index) => {
                const side = index === 0 ? -1 : 1  //used to reverse inequalities when border is left (index 0)
                if (vector[axis] - velocity[axis] === border  //true if obj is moving into border it was touching last frame 
                    && side * (vector[axis]) > side * border){
                        vector[axis] -= velocity[axis]
                        velocity[axis] = 0
                    }
                if (side * vector[axis] > side * border) { //checks collision, cant be true if previous if-block reset the newPos
                    this.collision(axis,index)
                }
            })
        } 
        this.framesActive += 1
        this.image.angle += this.rotationSpeed * (Math.PI*2 / this.game.fps)
        if (this.framesActive > this.frameLifeSpan) this.markedForDel = true;
    }
    collision(axis,borderIndex){
        const {velocity, vector, borders, force} = this
        const distanceCovered = Math.abs(velocity[axis])
        const overshootDistance = (Math.abs(vector[axis])-Math.abs(borders[axis][borderIndex]))
        const velocityCorrection = force[axis] * ( (distanceCovered-overshootDistance) / distanceCovered )
        vector[axis] = borders[axis][borderIndex]
        velocity[axis] -= force[axis] - velocityCorrection
        velocity[axis] *= -1
        const velMagnitude = Math.abs(velocity[axis])
        let decreaser = Math.pow(velMagnitude,this.bounceDampening) - (1-this.bounceDampening)
        if (decreaser < velMagnitude) velocity[axis] -= decreaser * Math.sign(velocity[axis])
        else velocity[axis] = 0
        console.log("bounced")
    }
    rotation(){
          
    }
    drawShadow(ctx){
        //super.drawShadow(ctx,this.shadow,1.1)
    }
}

class Coin extends Projectile{
    static imageParams = [`./images/coin.png`,55*0.5,42*0.5]
    static lastSfxValue = 0 
    constructor(game,startPoint,targetPoint){
        super(game, new GameImage(...Coin.imageParams), startPoint)
        this.game = game
        this.setSfx()
        this.airFriction = 0;
        this.rotationSpeed = randomValue(-0.5,0.5)
        this.start = startPoint 
        this.target = targetPoint
        this.unitVector = unitVector(vectorFromPoints(this.start,this.target))
        for (const axis in this.unitVector){
            this.velocity[axis] = this.unitVector[axis] * randomValue(-2,2)
            this.force[axis] = this.unitVector[axis] * randomValue(0.5,0.6)
        }
        this.relativeSpeed = -this.game.player.moveSpeed
        this.borders.z[0] = undefined
    }
    update(){
        super.update();
        if (this.vector.z < randomValue(-300,-200)) this.image.fadeAlpha(-0.25)
        if (this.image.alpha <= 0) {
            this.markedForDel = true;
            this.sfx.play(); 
            this.game.stats.coins += 1       
        }   
    }
    setSfx(){
        let num = Math.floor(randomValue(1,6))
        while(num === Coin.lastSfxValue) { num = Math.floor(randomValue(1,6)) }
        Coin.lastSfxValue = num
        this.sfx = new SoundEffect(`./sounds/coins/${num}.mp3`,0.3)
    }
}

class FiredArrow extends Projectile {
    static imageSource = './images/fired_arrow_2.png'
    constructor(game, basePoint){
        const image = new GameImage(FiredArrow.imageSource, 100*0.6, 185*0.6)
        super(game, image, basePoint)
        this.image.alpha = 0
        this.force.y = 0
        this.relativeSpeed = 0
        this.velocity = changeVectorLength(vectorFromPoints(basePoint,{x:125 * Math.sign(basePoint.x),y:250,z:0}), 150) 
        this.image.angle = Math.atan(this.velocity.x/this.velocity.z)
    }
    update(){
        super.update();
        this.image.fadeAlpha(0.25)
        this.checkForCollison();
    }
    checkForCollison(){
        if (this.vector.z > 150) return;
        const player = this.game.player
        if (player.lane === this.lane &&
            player.state === player.states["blocking"]){

            this.game.activeObjects.push(new BlockedArrow(this.game, this.vector))
            this.game.addScore(2)
            
        } else player.receiveAttack(-0.4)
        this.markedForDel = true;
    }
}

class BlockedArrow extends Projectile {
    static imageSource = './images/arrow_2.png'
    constructor(game, startPoint){
        const image = new GameImage(BlockedArrow.imageSource, 51*0.5, 178*0.5)
        super(game, image, startPoint)
        this.image.alpha = 1
        this.sfx = new SoundEffect(`./sounds/clank/${Math.floor(Math.random()*5)}.wav`,0.2)
        this.sfx.play(); 
        this.force.y = -1.5
        this.velocity.y = randomInt(30,40)
        this.velocity.x = Math.sqrt(square(40)-square(this.velocity.y)) * Math.sign(startPoint.x) * 0.5
        this.velocity.z = randomInt(0,15)
        this.borders.x = [undefined,undefined]
        this.image.angle = 0.5 * Math.sign(startPoint.x)
        this.rotationSpeed = (-29 + this.velocity.y) * Math.sign(startPoint.x) * randomValue(0.2,0.3)
        this.relativeSpeed = -this.game.player.moveSpeed
    }
    update(){
        if (this.vector.y < 200) this.image.fadeAlpha(-0.25)
        if (this.image.alpha === 0) this.markedForDel = true;
        super.update()
    }
}

class DroppedBow extends Projectile {
    static imageParams = ['./images/crossbow.png', 250*0.8, 141*0.8]
    constructor(game, startPoint, flipped){
        super(game, new GameImage(...DroppedBow.imageParams), startPoint)
        this.image.flipped = flipped
        this.bounceDampening = 0.9
        this.velocity = {x:0, y:8, z:-2}
    }
    update(){
        super.update();
        if (this.vector.z < 0) this.markedForDel = true
    }
}

class Spurt extends Projectile {
    constructor(game, image, startPoint){
        const adjustedPoint = {x: startPoint.x + randomInt(-25,25),
                                y: startPoint.y + randomInt(-25,25),
                                z: startPoint.z + randomInt(-5,-10)}
        super(game, image, adjustedPoint)
        this.bounceDampening = 1
        this.airFriction *= 2
        this.force.y *= 0.5
        this.frameLifeSpan = 48
        this.velocity.y = randomInt(0,15)
        this.velocity.x = randomInt(-5,5)
        this.velocity.z = randomValue(0,-5)
    }
    update(){
        super.update()
        
    }
}

class BloodSpurt extends Spurt {
    static imageSources = [`./images/blood/1.png`, `./images/blood/2.png`]
    constructor(game, startPoint){
        const image = new GameImage(BloodSpurt.imageSources[randomInt(0,1)], 40, 40)
        super (game, image, startPoint)
        
    }
}

class TurkeyMush extends Spurt {
    static imageSources = [`./images/turkey_bits/1.png`, `./images/turkey_bits/2.png`]
    constructor(game, startPoint){
        const image = new GameImage(TurkeyMush.imageSources[randomInt(0,1)], 40, 40)
        super (game, image, startPoint)
    }
}


class SoundEffect {
    constructor(fileSrc, volume){
        this.sound = new Audio()
        this.sound.volume = gameMuted ? 0 : volume
        this.sound.src = fileSrc
    }
    play(){
        this.sound.play()
    }
}

class Enemy extends GameObj{
    static enemies = []
    constructor(game, image, basePoint){
        super(game, image, basePoint)
        this.game = game
        this.sfx = {}

        Enemy.enemies.push(this)
    }
    spawnCoins(num){
        const startPoint = this.centralVector
        startPoint.z -= 150
        console.log(startPoint, this.centralVector)
        const playerPoint = {x: 0, y: 500, z: -400}
        for (let i = 0; i < num; i++) {
            const coin = new Coin(this.game,startPoint,playerPoint)
            this.game.activeObjects.push(coin)
        } 
    }
    drawShadow(ctx){
        super.drawShadow(ctx,this.shadow,1.1)
    }
}

class Bowman extends Enemy {   //eventually split into states to deal with the logic and differing images better
    static imageParams = { 
        unloaded: ['./images/bowman/unloaded.png', 321*0.8, 604*0.8],
        loaded: ['./images/bowman/loaded.png',321*0.8, 604*0.8],
        dead: ['./images/bowman/dead.png',321*0.8, 604*0.8],
    }
    static spawnWave(game, spawnDepth, waveSize=3){
        let x = 500 * randomSign()
        let depth = 4000
        const wave = [new Bowman(game, {x: x, y: 0, z: depth})]
        for (let i = 1; i < waveSize; i++) {
            x *= randomSign()
            let buffer = randomInt(300,400)
            if (x !== wave[i-1].x) buffer += 200
            depth -= buffer
            wave.push(new Bowman(game, {x: x, y: 0, z: depth}))
            Enemy.enemies.push(wave[i])
        }
        return wave;
    }
    constructor(game, basePoint){
        const unloaded = new GameImage(...Bowman.imageParams.unloaded)
        const loaded = new GameImage(...Bowman.imageParams.loaded)
        const dead = new GameImage(...Bowman.imageParams.dead)
        super(game, unloaded, basePoint)
        this.images = {loaded:loaded, unloaded:unloaded, dead:dead}
        this.image.alpha = 0;
        this.image.flipped = this.lane === "right" ? true : false
        this.states = { unloaded: "unloaded", loaded: "loaded",
                        fired: "fired", dead: "dead"}
        this.state = "unloaded"
        this.bowLoadDistance = 2000
        this.sfx.load = new SoundEffect (`./sounds/crossbow_loading/1.mp3`,0.1)
        this.sfx.death = new SoundEffect (`./sounds/death/${Math.floor(Math.random()*5)}.ogg`,0.3)
        this.sfx.death2 = new SoundEffect (`./sounds/gore/${Math.floor(Math.random()*3)}.wav`, 0.3)
        this.deathCounter = 0;
    }
    update(){
        if (this.vector.z < -150) this.markedForDel = true;
        if (this.state === this.states.dead) {
            this.deathCounter += 1
            if (this.deathCounter > 30) this.image.fadeAlpha(-0.1)
        } else {
            this.image.fadeAlpha(0.25)
        }
        if (this.vector.z < this.bowLoadDistance && this.state === "unloaded") this.loadBow()
        if (this.state === "loaded" && this.game.totalFrames > this.attackingFrame) this.attack();
    }
    loadBow(){
        this.state = "loaded"
        this.attackingFrame = this.game.totalFrames + 32
        this.image = this.images.loaded
        this.image.flipped = this.lane === "right" ? true : false 
        this.sfx.load.play();
    }
    attack(){
        this.state = "fired"
        this.image = this.images.unloaded
        this.image.flipped = this.lane === "right" ? true : false
        this.game.activeObjects.push(new FiredArrow(this.game, this.centralVector))
    }
    receiveAttack(){
        if (this.state === "dead") return;
        this.state = "dead"
        this.image = this.images.dead
        this.image.flipped = this.lane === "right" ? true : false
        this.sfx.death.play();
        this.sfx.death2.play();
        this.game.activeObjects.push(new DroppedBow(this.game, this.centralVector, this.image.flipped))
        for (let index = 0; index < 30; index++) {
            this.game.activeObjects.push(new BloodSpurt(this.game, this.centralVector))   
        }
        this.spawnCoins(5)
        this.game.addScore(10)
    }
    drawShadow(ctx){
        return;
    }
    
}

class Turkey extends Enemy {
    static imageParams = ['./images/turkey.png', 384*0.9, 206*0.9]
    static bufferFrames = 0;
    static turkeySpawnable(){
        if (Turkey.bufferFrames < 1) return true;
        Turkey.bufferFrames -= 1
        return false;
    }
    constructor(game, startPoint){
        const image = new GameImage(...Turkey.imageParams)
        super(game, image, startPoint)
        this.sfx.death = new SoundEffect (`./sounds/gore/${Math.floor(Math.random()*3)}.wav`, 0.3)
        Turkey.bufferFrames += randomInt(1000,1800) / this.game.speedModifier
    }
    update(){
        if (this.vector.z < 0) {
            this.markedForDel = true;
        }
    }
    receiveAttack(){
        this.markedForDel = true;
        this.game.player.updateHealth(0.5)
        this.sfx.death.play()
        for (let i = 0; i < 50; i++) {
           this.game.activeObjects.push(new TurkeyMush(this.game, this.centralVector)) 
        }
    }
}
class Pikeman extends Enemy {
    constructor(posX){
        //super()
    }
}

class Player {
    constructor(game, blockBitmaps, attackBitmaps){
        this.block = new Sprite(game, blockBitmaps, 842, 609)
        this.attack = new Sprite(game, attackBitmaps, 534*0.8, 871*0.8, 200)
        this.block.image.alpha = 1;
        this.attack.image.alpha = 1;
        this.game = game;
        this.states = { blocking: new Blocking(this), attacking: new Attacking(this)}
        this.lane = "middle"
        this.state = this.states.blocking;
        this.damageRecoveryEffect = 0;
        this.angleCounter = 0;
        this.health = 1
        this.minimumSpeed = 8
        this.moveSpeed = 8 
        this.healthOverlays = [...this.createHealthOverlays()]
        this.healthOverlayIndex = 0
        this.sfx = {hurt:[new SoundEffect(`./sounds/player_hurt/1.wav`,0.1), new SoundEffect(`./sounds/player_hurt/2.wav`,0.1),
                        new SoundEffect(`./sounds/player_hurt/3.wav`,0.1), new SoundEffect(`./sounds/player_hurt/4.wav`,0.1)]}
    }
    update(input){
        this.state.update(input);
        this.angleCounter += 1/15 * this.game.speedModifier
        if(!stillMotion) this.applyBounce()
        this.moveObjectsCloser()
    }
    draw(ctx){
        this.state.draw(ctx)
        ctx.drawImage(this.healthOverlays[this.healthOverlayIndex].image,0,0)
    }
    changeState(state){
        this.state.exit();
        this.state = this.states[state]
        this.state.enter();
    }
    moveObjectsCloser(){
        this.game.activeObjects.forEach((e)=>{
            e.vector.z -= this.moveSpeed + e.relativeSpeed
        })
    }
    receiveAttack(dmg){
        if (disableEnemyDamage) return;
        let sfxChoice = Math.floor(randomValue(0,4))
        this.sfx.hurt[sfxChoice].play();
        this.damageRecoveryEffect = 90
        this.game.stats.combo = 1
        this.updateHealth(dmg)
        this.changeState("blocking")  //change this to make it less punishing to get hit right after hitting attack?
    }
    updateHealth(dmg){
        this.health += dmg
        let healthOverlayIndex = Math.ceil(5-(this.health*5))
        if (healthOverlayIndex < 0) healthOverlayIndex = 0
        if (healthOverlayIndex > 4) healthOverlayIndex = 4
        this.healthOverlayIndex = healthOverlayIndex 
    }
    applyBounce(){    // look at fixing the damageRecoveryEffect, give it an ease in and out (check for diffence in damageBounceMod and damageRecovery Effect)
        let damageBounceMod = 1;
        if (this.damageRecoveryEffect > 1) {
            this.damageRecoveryEffect -=  2 * (this.damageRecoveryEffect/20)    
            damageBounceMod *= (1/this.damageRecoveryEffect)
        } else this.damageRecoveryEffect = 0 //delete?
        this.block.vector.y = 0 - this.getBounceMod(20 * damageBounceMod, this.angleCounter+0.25)
        this.game.changePerspectiveHeight(710-(this.getBounceMod(10 * damageBounceMod, this.angleCounter)))
    }
    getBounceMod(intensity, angleInput) {
        let bounceOffset = Math.sin(angleInput) * intensity
        if (bounceOffset > 0) bounceOffset *= -1
        return (bounceOffset ) + this.damageRecoveryEffect
    }
    createHealthOverlays(){
        const overlays = []
        overlays.push(new GameImage("",0,0))
        for (let i = 0; i < 4; i++){
            const imgSrc = `./images/health/stage${i+1}.png`
            overlays.push(new GameImage(imgSrc,1000,1000,0,0))
        }
        return overlays
    }
}
class PlayerState {
    constructor(player){
        this.player = player
    }
    enter(){}
    exit(){}
    update(){}
}

class Blocking extends PlayerState {
    constructor(player){
        super(player)
        this.sprite = this.player.block 
        this.sprite.setFrame(18)
        this.frameIncrement = 1;
        this.frameQueue = [18];
        this.positionInQueue = 0;
        this.frameDestinations = {'middle':18, 'left':0, 'right':34} 
        this.middleSkipRange = [12,26] 
        this.earlyFramesToSkip = 5
        this.inputDelayCounter = 0;
        this.angleCounter = 0;
        this.bounceDamageIntensity = 15
        this.damageRecoveryEffect = 0
        this.lastInput = 'middle'
    }
    enter(){
    }
    exit(){
        this.inputDelayCounter = 0;
        this.updateLane();
    }
    update(input){
        this.sprite.image.fadeAlpha(0.2)
        if (input === 'attack' && this.damageRecoveryEffect < 20){
            this.player.changeState("attacking")
            return;
        }
        else if ( ! (Object.keys(this.frameDestinations).includes(input)) ) return;
        if (--this.inputDelayCounter >= 0 || this.frameDestinations[input] === undefined) input = this.lastInput
        if (input !== this.lastInput) {
            this.inputDelayCounter = 4;
            this.makeFrameQueue(input)
        }
        this.lastInput = input;
        if (this.positionInQueue !== this.frameQueue.length) this.sprite.setFrame(this.frameQueue[this.positionInQueue++])
        this.updateLane()
    }
    draw(ctx){
        this.sprite.draw(ctx)
    }
    makeFrameQueue(input){
        this.frameQueue = [];
        this.positionInQueue = 0;
        let frame = this.sprite.frame
        const frameEnd = this.frameDestinations[input]; 
        const increment = Math.sign(frameEnd-frame)
        if (Object.values(this.frameDestinations).includes(frame)) {
            frame += this.earlyFramesToSkip * increment
        }
        for (let i = frame + increment; i !== frameEnd + increment; i += increment){
            this.frameQueue.push(i)
        }
        if(Math.abs(frame - frameEnd) > this.sprite.frames.length/2) {
            this.frameQueue = this.frameQueue.filter((e) => e < this.middleSkipRange[0] || e > this.middleSkipRange[1])
        }
    }
    updateLane(){
        if (this.inputDelayCounter > 0) return
        let lane = "middle"
        if (this.sprite.frame > 23) lane = "right"
        if (this.sprite.frame < 12) lane = "left"
        this.player.lane = lane;
    }
}

class Attacking extends PlayerState {
    constructor(player){
        super(player)
        this.sprite = this.player.attack
        this.activeFrameRange = [15,23]
        this.game = this.player.game
    }
    exit(){
        this.sprite.frame = 0
    }
    update(){
        this.sprite.image.fadeAlpha(0.2)
        this.checkCollision();
        const attack = this.sprite
        if (attack.frame === 0) {
            this.attackDirection = this.input;
        }
        attack.incrementFrame(1)
        if (attack.frame === attack.frames.length-1) {
            this.player.changeState("blocking")
        }
        this.angleAttack();
    }
    draw(ctx){
        if (this.sprite.frame != 0)this.sprite.draw(ctx)
    }
    checkCollision(){
        if (!this.inActiveFrameRange()) return;
        const activeObj = this.game.activeObjects
        for (let i = activeObj.length-1; i >= 0; i--) {
            if (activeObj[i] instanceof Enemy){
                let inRange = activeObj[i].vector.z < 400 
                            && activeObj[i].vector.z > (activeObj[i].lane === "middle" ? -100 : 100)  
                            && activeObj[i].lane === this.player.lane
                if (inRange) activeObj[i].receiveAttack();
            } 
        }
    }
    angleAttack(){
        const sprite = this.sprite
        sprite.image.angle = 0
        sprite.vector.x = 0
        sprite.vector.y = -300
        if (this.player.lane === "right"){ 
            sprite.image.angle = 1.35
            sprite.vector.y = -80
            sprite.vector.x = 30
            
        } else if (this.player.lane === "left") {
            sprite.image.angle = -1.35
            sprite.vector.y = -50
            sprite.vector.x = -40
        }  
    }
    inActiveFrameRange(){
        if (this.sprite.frame < this.activeFrameRange[0] || 
            this.sprite.frame > this.activeFrameRange[1]) return false;
        return true;
    }
}

async function loadSprites(){
    const bitmaps = {}
    await getSprite("./sword-attack-v2-compressed.json").then((resp) => bitmaps.attack = resp)
    await getSprite("./sword48.json").then((resp) => bitmaps.block = resp)
    return bitmaps
};

async function getSprite(spriteJsonSource){
    const response = await fetch(spriteJsonSource)
    const json = await response.json()
    const spriteName = loadBlankSprites ? `./images/empty.png` : `./images/${json.meta.image}` 
    const bitmaps = await getSpriteImages(json, spriteName)
    return bitmaps
}

async function getSpriteImages(spriteJson, spritesheetSrc){
    let bitmaps = []
    const sheet = new Image()
    const json = spriteJson
    await new Promise(resolve => {
        sheet.onload = (img)=>{
            resolve(img)
        }
        sheet.src = spritesheetSrc
    })
    for (let i = 0; i < json.frames.length-1; i++) {
        const data = json.frames[i].frame;
        bitmaps.push(createImageBitmap(sheet, data.x, data.y, data.w, data.h))
    }
    await Promise.all(bitmaps).then((response)=> {
        bitmaps = response
    })
    return bitmaps
}
 

