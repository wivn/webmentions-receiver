/* Improvements:
-  make redis url rely on process or localhost (DONE)
- make any mentions to localhost rely on constants (DONE)
- remove all req, res parts out of the Express API so it can be used with any server (DONE)
- make things like key expiry modifiable, and any mentions of localhost (DONE)

- write README.md to how to use it

- rewrite errors as classes (DONE)
- valid resource host should be an array (DONE)
- make database saver modifiable
- write as a class


- write database saver (DONE)

- revamp status page so it knows whether it's been processed or not
- add nice home screen
- add nice page on send with the message
- use custom domain instead of heroku.app (DONE)
*/

// MAIN PROGRAM
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:3031/meteor', {useNewUrlParser: true, useUnifiedTopology:true 
});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  // we're connected!
});
const { http, https } = require('follow-redirects');
const uuidv4 = require('uuid/v4');
const followRedirects = require('follow-redirects')
followRedirects.maxRedirects = 10;
var Queue = require('bull');
var redis = require("redis");

// CONSTANTS
var validResourceHost = [process.env.SITE || "localhost:3000"]
const statusURLBase = process.env.SITESTATUSBASE || "http://localhost:3000/status"
class ProtocolError extends Error {
	constructor(message, isTarget) {
	  super(message);
	  this.name = "ProtocolError";
	  this.isTarget = isTarget
	}
}


const sourceURLTookTooLongToLoad = "Too long to load source"
const alreadyBeingProcessedError = "AlreadyBeingProcessed"
const KEY_EXP = Number(process.env.KEYEXP) || 5
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
var client = redis.createClient({url: REDIS_URL});
client.on("error", function (err) {
    console.log("Error " + err);
});

// checks that URL is either http or https and that it's including the host url
function checkURLValidity(source, target){
	try {
		const sourceURL = new URL(source)
		const targetURL = new URL(target)
		
		if(sourceURL.protocol != "http:" && sourceURL.protocol != "https:"){	
			throw new ProtocolError("Incorrect protocol for source url", false)
		}
		if(targetURL.protocol != "http:" && targetURL.protocol != "https:"){
			throw new ProtocolError("Incorrect protocol for target url", true)
		}
		// only other check is valid resource
		return {isValid: validResourceHost.includes(targetURL.host) , err: {message: ""} }
	} catch(err){
		return {isValid: false, err: err}
	}
}
// #TODO UPDATE TO NOT USE REQ/RES
async function recieveWebmention(source, target){
	const isAsync = true
	const showStatus = true
	
	const urlValidityCheck = checkURLValidity(source, target)
	const isValidURL = urlValidityCheck.isValid
	if(isValidURL && source != target){
		try {
			if(isAsync){
				const isMentionedCheck = await verifyWebmentionAsync(source, target)
				
				if(isMentionedCheck.isProcessing && isMentionedCheck.err.message == ""){
					
					if(showStatus){
						const statusURL = `${statusURLBase}?source=${source}&target=${target}`
						return {message: "You can check the progress at " + statusURL, locationHeader: statusURL, status: 201}

					} else {
						// response 202 because there is no status page and realistically it shouldn't take too long to run
						return {message: "Your request will now be processed. Your Webmention should appear shortly.",
						 locationHeader: null, status: 202}
					}
					
				} else {
					const err = isMentionedCheck.err
					if(err.message == alreadyBeingProcessedError){
						
						return {message: "Your request is being processed. Please wait at least one minute before trying again.",
						 locationHeader: null, status: 400}
					} else {
						return {message: "Error in processing. Please try again.",
						 locationHeader: null, status: 400}
					}
				}
				
				
			} else {
				const isMentioned = await verifyWebmentionSync(source, target)
				if(isMentioned){
					saveToDatabase(source, target)
					return {message: "SUCCESSFULLY RECIEVED WEBMENTION",
						 locationHeader: null, status: 200}
				} else {
					return {message: "Cannot not find the target URL in the source URL provided",
						 locationHeader: null, status: 400}
				}
			}
			
			
		} catch(e){
			return {message: "Error with loading source URL",
						 locationHeader: null, status: 400}
		}
		
	} else {
		
		const urlValidityError = urlValidityCheck.err
		if(urlValidityError instanceof ProtocolError && !urlValidityError.isTarget){
			return {message: "Source URLs are required to start with http:// or https://",
						 locationHeader: null, status: 400}
		} else if(urlValidityError instanceof ProtocolError && urlValidityError.isTarget){
			return {message: "Target URLs are required to start with http:// or https://",
						 locationHeader: null, status: 400}
		} else if (source == target){
			return {message: "The source URL cannot equal the target URL",
						 locationHeader: null, status: 400}
		} else {
			return {message: "We do not support sending Webmentions to that target URL",
						 locationHeader: null, status: 400}
		} 
		
		
	}
}
function status(source, target){
	return new Promise(function (resolve, reject){
		const key = source + ";" + target;
		try	{
			client.get(key, function(err, data) {
				// data is null if the key doesn't exist
				if(err || data === null) {
					// if they key doesn't exist it means it hasn't been processed yet or it's already been processed
					resolve("Your Webmention has been processed or it hasn't been sent yet.")
				} else {
					// if the key does exist it means it's being processed
					resolve("In processing...")
				}
			});
		} catch(e){
			reject(e)
		}
	})
	
}
const webmentionSchema = new mongoose.Schema({ source: String, target: String, updated: { type: Date, default: Date.now }});
var WebmentionModel = mongoose.model('webmention', webmentionSchema);
function saveToDatabase(source, target){
	console.log("saving to local database...")
	console.log(source, target)
	var savedWebmention = new WebmentionModel({source: source, target: target, date: new Date()})
	savedWebmention.save(function (err, object) {
		if (err) return console.error(err);
	});
	/*const token = process.env.TOKEN
	if(token){	
		fetch(`https://api.github.com/repos/nickwil/blog/contents/webmentions/${String(uuidv4())}.txt`, {
		method: "PUT",
		headers: {
			
			Authorization: "Basic " + Buffer.from("nickwil:" + token).toString('base64'),
			
		},
		body: JSON.stringify({
			message: "Adding webmention",
			content: Buffer.from(source+";" + target).toString('base64')
		})
	}).then(res => res.text())
	.then(body => console.log(JSON.parse(body)))
	}*/
}
function getWebmentions(callback){
	WebmentionModel.find(function (err, webmentions) {
		if (err) return console.error(err);
		callback(webmentions);
	})
	/*
	// gets latest with that source and target
	WebmentionModel.findOne({ source: "http://localhost:3000/file", target: "http://localhost:3000/target" }).sort({created_at: -1}).exec(function(err, webmention) { 
		if (err) return console.error(err);
	  	console.log(webmention)
	 });*/
}
var jobsQueue = new Queue('verfiying', REDIS_URL);
jobsQueue.process(function(job, done){

	// job.data contains the custom data passed when the job was created
	// job.id contains id of this job.
  
	const source = job.data.source
	const target = job.data.target
	
	// if it's mentioned the job will be complete, and it will call the callback
	verifyWebmentionSync(source, target).then((value) =>{
		if(value){
			saveToDatabase(source, target)
		}
		done();
	}).catch((e) => {
		console.log(e)
		done();
	})
	
	
  
  });

async function verifyWebmentionAsync(source, target){
	return new Promise(function (resolve, reject){
		const key = source + ";" + target;
		
		try {
			client.get(key, function(err, data) {
				// data is null if the key doesn't exist
				if(err || data === null) {
					client.set(key,"not sent",'EX', KEY_EXP);	
					resolve( {isProcessing: true, err: {message: ""}})
					
					jobsQueue.add({source: source, target: target});

				} else {
					resolve( {isProcessing: true, err: new Error(alreadyBeingProcessedError)})
				}
			});
		} catch (e){
			reject({isProcessing: false, err:e})
		}
	
	})

} 

/*The receiver SHOULD check that target is a valid resource for which it can accept Webmentions. This check SHOULD happen synchronously to reject invalid Webmentions before more in-depth verification begins. What a "valid resource" means is up to the receiver. For example, some receivers may accept Webmentions for multiple domains, others may accept Webmentions for only the same domain the endpoint is on.*/
async function verifyWebmentionSync(source, target){
	// verify that the target url is mentioned in the source
	return new Promise(function (resolve, reject){
		var beginRequest;
		if(new URL(source).protocol == 'http' || process.env.LOCAL){
			beginRequest = http;
		} else{
			beginRequest = https;
		}
		const request = beginRequest.get(source, (res) => {
			// if the content is greater than 1 MB don't download it
			if(res.headers['content-length'] > 1000000 ){
				resolve(false)
			}
			res.setEncoding('utf8');
			res.on('data', function (body) {
				
				try{
					//checking for an exact match, not using per-media-type rules to determine whether target is in the source document
					console.log(body)
					resolve(body.includes(target))
					
				} catch(e){
					reject(e)
				}
				 
			});
		});
		// if it takes more than 5 seconds to load then cancel request
		request.setTimeout(5000, function(){
			request.abort()
			reject(new Error(sourceURLTookTooLongToLoad))
		})
	
	})
	
}


// EXPRESS SPECIFIC CODE
const fetch = require('node-fetch');
var formurlencoded = require('form-urlencoded').default;
function sendWebMention(source, target, webmentionEndpoint, callback){
	fetch(webmentionEndpoint, {
	  body: formurlencoded({source: source, target: target}),
	  headers: {
	    "Content-Type": "application/x-www-form-urlencoded"
	  },
	  method: "POST"
	})
	.then(res => {
		// make the response an object, if it worked set success, if not don't
		callback(res, undefined)
	}
	)
	.catch(err => {
					console.log("err")

			callback(undefined, err)
		}
	)
}


const express = require('express')
var bodyParser = require('body-parser')
const app = express()
const port =  process.env.PORT || 3000
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
 
// parse application/json
app.use(bodyParser.json())

app.get('/file', (req,res) => {
	app.set('Content-Type', 'text/html; charset=utf-8')
	setTimeout(function () {
        res.sendFile('/Users/nicolaswilhelm/Desktop/url-organizer/webmentions/folder/index.html')
    }, 0);
	
})
app.get('/', (req, res) => {
	
	res.send("called")
	
})
// can pretty easily save to Github with the click of a button once approved, just save them all in a file
app.get('/seeWebmentions', (req, res) => {
	getWebmentions((data) => res.json(data))
})
app.get('/status', function (req, res){
	// http://localhost:3000/status?source=localhost:3000/file&target=localhost:3000/target
	const source = req.query.source
	const target = req.query.target
	status(source, target).then((msg) => {
		res.send(msg)
	}).catch((e) => {
		res.status(400)
		res.send("An error occured. Please try again later.")
	})
	
})
app.post('/webmention', async (req, res) => {
	recieveWebmention(req.body.source, req.body.target).then((data) => {
		res.status(data.status)
		if(data.locationHeader){
			res.set('Location', data.locationHeader)
		} 
		res.send(data.message)
	}).catch((e) => console.log(e))
	
})

app.listen(port, () =>{ 
	// token will only exist in production
	if(process.env.LOCAL){
		sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
		res.text().then((body) => console.log(body))
	})
	}
	
})
