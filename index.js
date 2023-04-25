const { Socket } = require("dgram");
const express= require("express")
const http= require("http")
const mongoose= require("mongoose");
const { setInterval } = require("timers/promises");
const getSentence = require("./api/getSentance");
const Game= require("./models/Games")
const { setIntervalAsync, clearIntervalAsync, SetIntervalAsyncTimer } = require('set-interval-async');
//create server
const app = express();

const port =process.env.port || 3000;

var server= http.createServer(app);
var io=require("socket.io")(server);

//middleware
app.use(express.json());

//connect to mongodb
const DB="mongodb+srv://siva:siva123q4@cluster0.p9wv71l.mongodb.net/?retryWrites=true&w=majority";

//listening to socket io event from the client(flutter code)
io.on('connection', (socket)=>{
    console.log(socket.id);
    //for create
    socket.on('create-game', async ({nickname})=>{

        try{
            let game = new Game();
            const sentence = await getSentence();
            game.words = sentence;
            //new object
            let player={
                socketID:socket.id, 
                nickname,
                isPartyLeader:true,
            }
            game.players.push(player)
            game= await game.save();
            const gameId = game._id.toString();
            socket.join(gameId);
            io.to(gameId).emit('updateGame', game);

        }
        catch(e){
            console.log(e);
        }
        // console.log(nickname);
    });
    socket.on('join-game', async({nickname,gameId})=>{
        try{
            if(!gameId.match(/^[0-9a-fA-F]{24}$/)){
                socket.emit('notCorrectGame',
                 "please enter vaild game ID")
                return;
            }         
            let game= await  Game.findById(gameId);
            
          
            if(game.isJoin){              
                const id=game._id.toString();
                let player={
                    nickname,
                    socketID:socket.id,
                }               
                socket.join(id);                
                game.players.push(player);              
                game= await game.save();                
                io.to(gameId).emit('updateGame', game);
                
            }else{
                socket.emit("notCorrectGame",
                "The game is in progress ,please try again later")
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on("userInput",async({userInput,gameID})=>{
        let game =await Game.findById(gameID);
        console.log(gameID);
        console.log(`userInput is ${userInput}`);
        //console.log(game);
        if(!game.isJoin && !game.isOver){
            let player = game.players.find((playerr) => playerr.socketID === socket.id);
            //let player = game.players.find((playerr) => playerr.socketID === socket.id);
            console.log(`player.socketID is ${player}`);
               console.log(`player.currentWordIndex is ${player.currentWordIndex}`);
            if(game.words[player.currentWordIndex] === userInput.trim() ){
                player.currentWordIndex = player.currentWordIndex+1;
                if( player.currentWordIndex !== game.words.length){
                    game= await game.save();
                    io.to(gameID).emit('updateGame', game);
                }
                else{
                    let endTime = new Date().getTime();
                    let {startTime}=game;
                    player.WPM=calculateWPM(endTime, startTime,player); 
                    game= await game.save();
                    socket.emit('done');
                    io.to(gameID).emit('updateGame', game);
                }

            }
        }
    }
    
    );

    // timer listener
  socket.on("timer", async ({ playerId, gameID }) => {
    let countDown = 5;
    let game = await Game.findById(gameID);
    // console.log(" WORking 2");
    // console.log(` gameID is ${gameID}`);
    let player = game.players.id(playerId);
    // console.log(" WORking 21");
    // console.log(` playerId is ${playerId}`);
    if (player.isPartyLeader) {
      
        // console.log(" WORking 23");
      let timerId = setIntervalAsync( async () => {
        // console.log(" WORking 24");
        if (countDown >= 0) {
          io.to(gameID).emit("timer", {
            countDown,
            msg: "Game Starting",
          });
          console.log(countDown);
          countDown--;
        } else {
          game.isJoin = false;
        //   console.log(" WORking 212");
           game = await game.save();
           
            console.log(game);
           io.to(gameID).emit("updateGame", game);
        //    console.log(" WORking 24");
          startGameClock(gameID);
        //   console.log(" WORking 25");
           clearIntervalAsync(timerId);
        //    console.log(" WORking 26");
        //   console.log('game START!');
        
        }
      }, 1000);
    }
  });
  
});

    
const startGameClock= async (gameID)=>{
    let game= await Game.findById(gameID);
    console.log(game);
    game.startTime=new Date().getTime();
    console.log(game.startTime);
    game = await game.save();
    let time=120;

    let TimerId= setIntervalAsync(( function gameIntervalFunc(){ 
        if(time>=0){
            const timeFormat=calculateTime(time);
            io.to(gameID).emit('timer',{
                countDown:timeFormat,
                msg:"time Remaining"
            });
            console.log(time);
            time--;  
        } else {
            (async()=>{

                try{
                    let endTime = new Date().getTime();
                    let game= await Game.findById(gameID);
                    let {startTime}=game;
                    game.isOver=true;
                    game.players.foreach((player, index) => { 
                        if(player.WPM=== -1){
                            game.players[index].WPM=calculateWPM(endTime, startTime,player); }
                    });
                   
                    game= await game.save();
                    io.to(gameID).emit('updateGame', game);
                    clearIntervalAsync(TimerId);
                } catch(e){

                }
                
            })();
        }
        
        return gameIntervalFunc;
    // }));
})(),
1000
)

};
    



const calculateTime= (time)=>{
    let min= Math.floor( time/60);
    let sec = time%60;
    return `${min}:${sec <10 ? "0"+sec:sec}`;
}

const calculateWPM = (endTime, startTime,player)=>{
    const timeTakenInSec= (endTime-startTime)/1000;
    const timeTaken= timeTakenInSec/60;
    let wordsTyped= player.currentWordIndex;
    const WPM = Math.floor(wordsTyped/timeTaken);
    return WPM;

}
mongoose.connect(DB).then(()=>{
    console.log("connection Successful!");
}).catch((e)=>{
    console.log(e);
})
// listen to server 
server.listen(port,"0.0.0.0",()=>{
    console.log("server started running on port " +port);
});


