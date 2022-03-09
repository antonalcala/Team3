/*
    Dependencies:

    express:                Web Server Framework for nodejs
    http:                   Used to create a server
    path:                   Used to combine relative paths and show our app where its static files are, etc.
    mongoose:               Used as a wrapper for mongodb, we use it to connect to the database
    express-session:        Allows sessions which are basically how users log in to their account and stay logged in during their session
    connect-mongo:          Used for storing sessions in our database
    axios:                  Used to make requests to routes from inside socket.io, so that we can save our conversation in
                            our database
    body-parser:            Used to parse information from forms mainly, probably won't use but just in case
    socket.io:              Create a socket connection with server and client, how we send messages without reloading

    Other:

    PORT:           The default port number that the server will run on if there is no environmental
                    variable configured (which would happen when deployed on heroku)
*/

let express = require("express"),
    http    = require("http"),
    path    = require("path");
let mongoose = require("mongoose");
let session = require("express-session");
let sharedSIOSession = require("express-socket.io-session");
let mongoStore = require("connect-mongo");
let bodyParser = require("body-parser");
const PORT = 8000;
const app = express();
const server = http.createServer(app);
const cors = require('cors');

// initializing socket.io
const io = require("socket.io")(server);


// Example database object that we save message from client into database
const SimpleObject = require('./models/simple');


// Access to environmental variables
require('dotenv').config();


// For using c.o.r.s (Cross Origin Resource Sharing)
// So we can make request across different urls,
// which will happen when deploying live version
app.use(cors());


// Setting up conventional stuff for server
//probably won't need since likely won't be making conventional api calls to server,
// mainly realtime socket stuff
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
let routes = require('./routes/routes');
app.use('/api/', routes);


/////////////// DB initialization
let URI; // will be updated once deployed
// Connect to database
mongoose.connect(process.env.DBLOCALURI || URI,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })

let db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error connecting to mongodb'));

db.on('connected', function() {
    console.log("Database has connected!")
});

let sessionData = session({
    secret: 'Server initialized',
    resave: true,
    saveUninitialized: true,
    store: mongoStore.create({
        mongoUrl: process.env.DBLOCALURI
    })
})
app.use(sessionData);



io.use(sharedSIOSession(sessionData, {
    autoSave: true
}));

const MAXSPEED = 4;
function getRandomInt(max) {
    //random num from 1 to max, inclusive
    return (Math.floor(Math.random() * max)) + 1;
}


const enemy_info = {
    'jc': {
        'is_good': true,
        'id': 0,
        'max_time_alive': 200,
        'speed': getRandomInt(MAXSPEED)
    },
    'cow': {
        'is_good': true,
        'id': 1,
        'max_time_alive': 200,
        'speed': getRandomInt(MAXSPEED)
    },
    'ricky': {
        'is_good': false,
        'id': 2,
        'max_time_alive': 300,
        'speed': getRandomInt(MAXSPEED)
    },
    'david': {
        'is_good': false,
        'id': 3,
        'max_time_alive': 300,
        'speed': getRandomInt(MAXSPEED)
    },
    'anton': {
        'is_good': false,
        'max_time_alive': 300,
        'speed': getRandomInt(MAXSPEED),
        'id': 4
    },
    'armando': {
        'is_good': true,
        'max_time_alive': 300,
        'speed': getRandomInt(MAXSPEED),
        'id': 5
    },
    'david2': {
        'is_good': true,
        'max_time_alive': 300,
        'speed': 20,
        'id': 6

    },
}





// main socket.io stuff
io.on('connection', socket => {

    //// When client joins, emit message
    emitWelcome(socket);

    //// Fetching types of enemies
    listenForEnemyTypesFetched(socket);

    //// Joining rooms
    listenForJoiningNewRoom(socket, roomTracker);
    listenForJoiningExistingRoom(socket, roomTracker);

    //// Fetch all entities
    listenForFetchingAllEntities(socket);

    //// Handle Enemies
    listenForAppendingEnemyByHost(socket);
    listenForEnemyRemoved(socket);
    listenForUpdatingEnemyCoordsByHost(socket);

    //// Client disconnects
    listenForDisconnection(socket, roomTracker);

    //// Handle Rangers
    // Ranger updates coordinates
    listenForUpdatingCoordinates(socket)

    //// Send opponent rangers to everyone in room
    listenForFetchingOpponentRangers(socket, roomTracker);
    });

//////////////////////////////////////////////////////////
// Setup Calls
//////////////////////////////////////////////////////////
const emitWelcome = (socket) => {
    socket.emit("WelcomeClient", {
        message: "Welcome to sky danger ranger! we're glad to have you here. It's gonna be a ride!",
        socketID: socket.id
    });
};

const listenForEnemyTypesFetched = socket => {
    socket.on('fetchEnemies', request => {
        socket.emit("enemyInfoToClient", enemy_info);
    })
}

//////////////////////////////////////////////////////////
// Handling Enemies
//////////////////////////////////////////////////////////
const roomToEnemyList = {}
const listenForAppendingEnemyByHost = (socket) => {
    socket.on("hostAppendingNewEnemy", request => {

        if(roomTracker[socket.handshake.session.roomID]["host"] === socket.id){

            let id = request.id;
            if (!roomToEnemyList[socket.handshake.session.roomID]) {
                // Initialize as empty
                roomToEnemyList[socket.handshake.session.roomID] = {};
            }
            roomToEnemyList[socket.handshake.session.roomID][id] = request;
        }
    });
};

const listenForEnemyRemoved = (socket) => {
    socket.on("removeEnemy", request => {
        const id = request.id;
        let enemyList = roomToEnemyList[socket.handshake.session.roomID];
        delete enemyList[id];
        console.log("enemy deleted!!!:", id)
    });
};

const listenForUpdatingEnemyCoordsByHost = (socket) => {
    // Assuming enemies don't change levels
    // Expects request in the form of
    // req = {
    //     'id':id,
    //     'x':x,
    //     'y':y,
    // }

    socket.on("hostUpdatingEnemyCoordinates", request => {
        if(roomTracker[socket.handshake.session.roomID]["host"] === socket.id) {
            let enemyList = roomToEnemyList[socket.handshake.session.roomID];
            if (!!enemyList[request.id]){
                // If enemy still exists in server
                // Not sure what would potentially happen in high speed socket transmissions
                enemyList[request.id]['x'] = request.x;
                enemyList[request.id]['y'] = request.y;
                // console.log(`Updating id: ${request.id} with coords: (${request.x}, ${request.y})`)
            }
        }
    })
};

//////////////////////////////////////////////////////////
// Handling Room Joining
//////////////////////////////////////////////////////////
// Keep track of what room all rangers are connected to
let roomTracker = {}

const listenForJoiningExistingRoom = (socket, roomTracker) => {
    socket.on("joinExistingRoom", request => {
        console.log("ID joining:", socket.id)
        console.log("Before Joining existing room", roomTracker)
        if (!!roomTracker[request.roomID]){
            socket.join(request.roomID)
            roomTracker[request.roomID].list.push(socket.id)
            socket.broadcast.to(request.roomID).emit("newPlayerJoinedRoom", {
                roomID: request.roomID,
                socketID: socket.id
            });
            socket.handshake.session.roomID = request.roomID;
            console.log("After Joining existing room",roomTracker)
            socket.handshake.session.save()
        }
    });
};

const listenForJoiningNewRoom = (socket, roomTracker) => {
    socket.on("joinNewRoom", request => {
        console.log("ID joining:", socket.id)
        console.log('Before new room', roomTracker)
        if (!roomTracker[request.roomID]){
            socket.join(request.roomID)
            roomTracker[request.roomID] = {
                list: [socket.id],
                host: socket.id
            }

            console.log("After new room", roomTracker)
            socket.handshake.session.roomID = request.roomID;
            socket.handshake.session.save()
        }
    });
}


//////////////////////////////////////////////////////////
// Handle Rangers
//////////////////////////////////////////////////////////
// Coordinates of all rangers connected to server
let rangerCoordinatesTracker = {}

const listenForFetchingOpponentRangers = (socket, roomTracker) => {

    socket.on("fetchOpponentRangers", request => {
        const roomID = socket.handshake.session?.roomID;
        if (!!roomID){

            io.to(roomID).emit("serverSendingOpponentRangersInGame", roomTracker[roomID])
        }
    });
}

const listenForUpdatingCoordinates = (socket) => {

    // Should also take into account health
    socket.on("updateMyCoordinates", request => {
        // console.log(`ID: ${socket.id} ${request?.x} ${request?.y}`);
        rangerCoordinatesTracker[socket.id] = {
            'x': request?.x,
            'y': request?.y,
            'z': request?.z,
        }

        socket.broadcast.to(socket.handshake.session.roomID).emit("updateOpponentRangerCoordinates", {
            'x': request?.x,
            'y': request?.y,
            'z': request?.z,
            'socketID': socket.id
        })
    });
};

//////////////////////////////////////////////////////////
// Misc
//////////////////////////////////////////////////////////
const listenForClientMessageToDB = (socket) => {
    socket.on("clientMessageToDatabase", request => {
        if (!request.username || !request.message) {
            console.log("User didn't specify both username and message! Rip to the B.I.G.");
            return;
        }

        let newDBObject = {
            username: request.username,
            message: request.message
        };

        SimpleObject.create(newDBObject).then(createdDBObject => {
            console.log("New object created! Here it is: ", createdDBObject);
        });
    });
}



const listenForDisconnection = (socket, roomTracker) => {
    socket.on('disconnect', () => {
        console.log(`Client with the following id has connected: ${socket.id}`);
        console.log(`Was in room:`, socket.handshake.session?.roomID)

        let roomLength = roomTracker[socket.handshake.session.roomID]?.list.length
        let list = roomTracker[socket.handshake.session.roomID]?.list

        for(let i = 0 ; i < roomLength; i++){
            // remove person from list of players in room
            if (list[i] === socket.id){
                list.splice(i, 1);
            }
        }
    });
};





//TODO
const listenForFetchingAllEntities = (socket) => {
    const {roomID} = socket.handshake.session;

    socket.on('fetchAllEntities', request => {

        if (!!socket.handshake.session.roomID){
            // Get Enemies
            let enemies = roomToEnemyList[socket.handshake.session.roomID];
            if (!enemies){
                socket.emit("allEntitiesToClient", {
                    "enemies": {}
                });
            }else{

                socket.emit("allEntitiesToClient", {
                    "enemies": enemies
                });
            }


            //TODO Get rangers
            // let opponent_rangers = roomTracker[socket.handshake.session.roomID]["list"];
            // Didn't work as easy when Done here
        }

    });
};


/*
 * Create Server
 */
server.listen((process.env.PORT || PORT), () => {
    console.log("Sky Danger Ranger is running in port " + PORT);
});