#!/usr/bin/env node


const fs = require('fs');
const path = require('path');

const http = require('http');

const crypto = require('crypto'); // for randomUUID

const serverPort = process.env.SERVER_PORT || 5123;

const EventEmitter = require('events').EventEmitter;


var publicPath = path.join(__dirname, 'public');

var express = require('express');

var app = express();

app.use(express.json());

/*

app.get('/serverConfig', function(req, res) {

    res.setHeader('Content-Type', 'application/json');

    let config = {
        hubitatLight,
    };

    res.end(JSON.stringify(config));
});
*/


app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
    next();
});

class Session extends EventEmitter {
    static sessionList = [];

    hookList = [];
    hookId = 0;

    constructor() {
        super();

        this.uuid = crypto.randomUUID();
        Session.sessionList.push(this);
    }

    init(req, res) {
        // Code stolen from express-sse, which I can't use directly because I want each
        // session to have its own SSE stream.

        console.log('starting session for ' + this.uuid);

        let id = 0;

        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        //res.setHeader('Access-Control-Allow-Origin', allowOrigin);
        if (req.httpVersion !== '2.0') {
            res.setHeader('Connection', 'keep-alive');
        }
        this.sseDataListener = data => {
            if (data.id) {
                res.write(`id: ${data.id}\n`);
            } else {
                res.write(`id: ${id}\n`);
                id += 1;
            }
            if (data.event) {
                res.write(`event: ${data.event}\n`);
            }
            res.write(`data: ${JSON.stringify(data.data)}\n\n`);
            // res.flush();
        };

        this.on('data', this.sseDataListener);

        // Remove listeners and reduce the number of max listeners on client disconnect
        req.on('close', () => {
            this.close();
        });
    }

    send(data, event, id) {
        this.emit('data', { data, event, id });
    }

    close() {
        console.log('on close');

        this.removeListener('data', this.sseDataListener);

        for(let ii = 0; ii < Session.sessionList.length; ii++) {
            if (Session.sessionList[ii].uuid == this.uuid) {
                Session.sessionList.splice(ii, 1);
                break;
            }
        }
    }

    async controlRequest(req, res) {

        console.log('control request', req.body);
        

        
        res.setHeader('Content-Type', 'application/json');

        let result = {};

        res.end(JSON.stringify(result));

    }

    async hookRequest(req, res) {

        console.log('hookRequest');

        let requestObj = {
            hookId: ++this.hookId,
            body: req.body,            
            headers: req.headers,
            method: req.method,   
            originalUrl: req.originalUrl,
        }
        this.hookList.push(requestObj);

        console.log('requestObj', requestObj);

        this.send(requestObj, 'hook');


        res.setHeader('Content-Type', 'application/json');

        let result = {};

        res.end(JSON.stringify(result));

    }

    static find(uuid) {
        for(let ii = 0; ii < Session.sessionList.length; ii++) {
            if (Session.sessionList[ii].uuid == uuid) {
                return Session.sessionList[ii];
            }
        }
        return null;
    }

}


// SSE event stream
app.get('/stream', function (req, res) {
    const sessionObj = new Session();
    sessionObj.init(req, res);

    const startData = {
        uuid: sessionObj.uuid,
    };

    sessionObj.send(startData, 'start');

});

function checkSession(req, res) {
    const urlParts = req.url.split('/');
    if (urlParts.length < 3) {
        console.log('control request bad url', req.url);
		res.status(404).send('').end();
        return null;
    }
    let sessionObj = Session.find(urlParts[2]);
    if (!sessionObj) {
        console.log('control request bad session ' + urlParts[2]);
		res.status(404).send('').end();
        return null;
    }

    return sessionObj;
}

app.post('/control/*', async function(req, res) {
    let sessionObj = checkSession(req, res);
    if (!sessionObj) {
        return;
    }

    await sessionObj.controlRequest(req, res);
});

app.get('/hook/*', async function(req, res) {
    let sessionObj = checkSession(req, res);
    if (!sessionObj) {
        return;
    }

    await sessionObj.hookRequest(req, res);
});

app.post('/hook/*', async function(req, res) {
    let sessionObj = checkSession(req, res);
    if (!sessionObj) {
        return;
    }

    await sessionObj.hookRequest(req, res);
});

app.use('/', express.static(publicPath));


let serverOptions = {

};

var server = http.createServer(serverOptions, app).listen(serverPort, function () {
    //logger.info("listening for http on port " + serverPort);
});