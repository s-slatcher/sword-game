/**  @type {HTMLCanvasElement} */
const canvas = document.getElementById("canvas1");
const ctx = canvas.getContext('2d');
const CANVAS_WIDTH = canvas.width = 1000
const CANVAS_HEIGHT = canvas.height = 750;
const FRAME_RATE = 20.8333;//20.83333 = 48fps;
let lastTimeStamp = 0;
let frameTime = 1;
let frameTimeDeficit = 0;
let worstFrameTime = 0;
let timerGame = 0;
let timerNative = 0;
let loaded = false;
const keyRecord = {
    a:{pressed:false},
    d:{pressed:false}}; 
const sfx = { clink: new Audio()};


window.addEventListener('keydown', (e) =>{
    keyRecord[e.key] = { pressed:true, key: e.key } 
})
window.addEventListener('keyup', (e) => {
    keyRecord[e.key].pressed = false;
})

window.addEventListener('click', () => {
    sfx.clink.src = `./clink-sfx/${Math.floor(Math.random()*6)}.wav`
    sfx.clink.play();
} )

document.getElementById("volume").addEventListener('change', changeVolume)

function changeVolume(event){
    for (const [key,value] of Object.entries(sfx)) {
        sfx[key].volume = event.target.value/100;
    }
    console.log(event.target.value)   
}



class Player {
    constructor() {
        this.blockSprite,
        this.attackSprite,
        this.currentFrame = 18;
        this.targetFrame = { a: 0, d: 34, neutral: 18 };
        this.framesToSkip = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
        this.frameIncrement = 1;
        this.lastInput = 'neutral';
        this.input = 'neutral';
        this.inputDelayCounter = 0;
        this.frameCounter = 0;
        this.bounceModifier = 0;
        this.swayModifier = 0;
        this.blocking = {left: false, right: false}
        this.attacking = {left: false, neutral: false, right: false}
    }
    readInput(){
        
        let inputCandidate = 'neutral';
        if (keyRecord.d.pressed) inputCandidate = 'd'
        if (keyRecord.a.pressed) inputCandidate = 'a'
        this.input = this.lastInput === 'neutral' || !keyRecord[this.lastInput].pressed ? 
            inputCandidate : this.lastInput;
        if (this.inputDelayCounter > 0){
            this.input = this.lastInput
            this.inputDelayCounter -= 1;
        }
        if (this.input !== this.lastInput){
            this.inputDelayCounter = 4;
        }
        this.lastInput = this.input;
    }
    update(){
        this.readInput();
        this.updateBounceModifier();
        this.updateBlockAnimation();
        this.updateAttackAnimation();
    }
    updateBounceModifier() {
        this.bounceModifier = Math.sin(this.frameCounter / 10) * 15;
        this.swayModifier = Math.cos(this.frameCounter / 20) * 10;
        if (this.bounceModifier > 0)
            this.bounceModifier *= -1;
        if (this.swayModifier > 0)
            this.swayModifier *= -1;
    }
    updateAttackAnimation() {
        const isAttacking = Object.values(this.attacking).includes(true);
        console.log(isAttacking) 
        
    }
    updateBlockAnimation(){
        let target = this.targetFrame[player.input]
        let frameDifference = target-this.currentFrame
        if (frameDifference === 0) return;
        let skipFrame = (!this.framesToSkip.includes(target) && !this.framesToSkip.includes(this.currentFrame))

        this.frameIncrement = Math.sign(frameDifference)
        this.currentFrame += (this.frameIncrement);

        if (skipFrame && (Math.abs(frameDifference) > 20 )) sfx.swipe.play();
        if (skipFrame && this.framesToSkip.includes(this.currentFrame)){
            this.currentFrame = 18 + this.frameIncrement*(Math.ceil(this.framesToSkip.length/2))
        }
    }
    
    draw(){
        
        const blockSprite = this.blockSprite
        const frame = blockSprite.frames[this.currentFrame].frame;
        ctx.drawImage(
            blockSprite.image, 
            frame.x, frame.y, 
            frame.w, frame.h,
            blockSprite.offSetWidth + this.swayModifier , blockSprite.offSetHeight + this.bounceModifier,
            frame.w, frame.h);
    }
}
let player = new Player();


(async () => {
      const res = await Promise.all([
        fetch("./sword48.json"),
        fetch("./sword-attack-1.json"),
        //fetch("./crossbow-attack.json")
      ]);
      const data = await Promise.all(res.map(r => r.json()))
      console.log(data.flat());
      data.forEach((json) => {
        json.image = new Image();
        json.image.src = `./${json.meta.image}`;
        json.offSetWidth = 0+CANVAS_WIDTH*0.1;
        json.offSetHeight = 0+CANVAS_HEIGHT*0.15;
        player[json.meta.name] = json;
      })
      loadSound();
      animate(0);
})();

function loadSound(){
    sfx.music = new Audio();
    sfx.music.src = './Loop_The_Bards_Tale.wav'
    sfx.music.playbackRate = 1;
    sfx.music.volume = 0;
    sfx.music.loop = true;
    sfx.music.play();
    sfx.swipe = new Audio();
    sfx.swipe.volume = 0;
    sfx.swipe.src = './swish-9.wav'
    sfx.swipe.playbackRate = 1;

}


function readInput(){
    let lastInput = player.lastInput;
    let inputCandidate = 'neutral';
    if (keyRecord.d.pressed) inputCandidate = 'd'
    if (keyRecord.a.pressed) inputCandidate = 'a'
    let input = lastInput === 'neutral' || !keyRecord[lastInput].pressed ? 
            inputCandidate : lastInput;
    console.log(input)
    player.input = input;
    if (player.inputDelayCounter > 0){
        player.input = player.lastInput
        player.inputDelayCounter -= 1;
    }
    if (player.input !== player.lastInput){
        player.inputDelayCounter = 4;
    }
    player.lastInput = player.input;
    
}

function updatePlayerAnimation(player){

    player.updateBounceModifier();
    const newDirection = readPlayerMovement(player.lastInput);
    updatePlayerMovement(player.targetFrame[newDirection]);
    player.updateAttackAnimation();

}

function updatePlayerMovement(target){
    let frameDifference = target-player.currentFrame
    if (frameDifference === 0) return;
    let skipFrame = (!player.framesToSkip.includes(target) && !player.framesToSkip.includes(player.currentFrame))
    
    player.frameIncrement = Math.sign(frameDifference)
    player.currentFrame += (player.frameIncrement);

    if (skipFrame && (Math.abs(frameDifference) > 20 )) sfx.swipe.play();
    if (skipFrame && player.framesToSkip.includes(player.currentFrame)){
        player.currentFrame = 18 + player.frameIncrement*(Math.ceil(player.framesToSkip.length/2))
    }

}




function getFramesDue(timestamp){
    frameTime = timestamp - lastTimeStamp;
    lastTimeStamp = timestamp;
    frameTimeDeficit += frameTime;
    const framesDue = Math.floor(frameTimeDeficit/FRAME_RATE);
    frameTimeDeficit = frameTimeDeficit % FRAME_RATE;
    return framesDue;
    }

function animate(timestamp){
    let framesDue = getFramesDue(timestamp);
    for (let i = 0; i < framesDue; i++){
        ctx.clearRect(0,0,CANVAS_WIDTH, CANVAS_HEIGHT);
        player.update();
        player.draw();
        player.frameCounter++
        timerGame ++;
    }
    timerNative++;
    displayFrameInfo();
    requestAnimationFrame(animate);  
}

function displayFrameInfo(){
    document.getElementById("game_timer").innerHTML = timerGame;
    document.getElementById("game_label").innerHTML = `game frames (${FRAME_RATE}ms, ${Math.floor(1000/FRAME_RATE)}fps): `
    document.getElementById("native_label").innerHTML = 
    `real frames (${Math.floor(frameTime*1000)/1000}ms,
    ${Math.floor(1000/frameTime)}fps)
    average: ${Math.floor((timerNative/timerGame)*1000/FRAME_RATE)}fps:`;
    document.getElementById("native_timer").innerHTML = Math.floor(timerNative);  
}  
