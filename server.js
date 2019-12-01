/* 
- write README.md to how to use it
	- it's all built-in like I built it but easily change the database saving and status by extending the class
- revamp status page so it knows whether it's been processed or not
- add nice home screen
- add nice page on send with the message


TODO:

// add random delay (longer during testing)
status page response:
	if webmention exists return last time it was updated and check in Redis whether it's being processed there [there was a requesrt
		for an update in the last 60 seconds, if your update is not appearing please wait]
	if webmention doesn't exist then check to see if it's being processed in redis, if it is then say it's being processed if not it never 
	was sent and tell the user that

	OPTIONAL: use redis just for the job queue and remove the key making thing and just add that to mongodb and add the checks there to 
	make sure they're not spamming stuff
*/

// MAIN PROGRAM
const mongoose = require('mongoose');
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

class WebmentionReciever {
	constructor(){
		mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:3031/meteor', {useNewUrlParser: true, useUnifiedTopology:true 
		});
		this.db = mongoose.connection;
		this.db.on('error', console.error.bind(console, 'connection error:'));
		this.db.once('open', function() {
		// we're connected!
		});
		this.client = redis.createClient({url: REDIS_URL});
		this.client.on("error", function (err) {
			console.log("Error " + err);
		});
		this.jobsQueue = new Queue('verfiying', REDIS_URL);
		this.jobsQueue.process(function(job, done){

			// job.data contains the custom data passed when the job was created
			// job.id contains id of this job.
		
			const source = job.data.source
			const target = job.data.target
			
			// if it's mentioned the job will be complete, and it will call the callback
			reciever.verifyWebmentionSync(source, target).then((value) =>{
				if(value){
					reciever.saveToDatabase(source, target)
				}
				done();
			}).catch((e) => {
				console.log(e)
				done();
			})
			
			
		
		});

	}
	// checks that URL is either http or https and that it's including the host url
	checkURLValidity(source, target){
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

	async recieveWebmention(source, target){
		const isAsync = true
		const showStatus = true
		
		const urlValidityCheck = this.checkURLValidity(source, target)
		const isValidURL = urlValidityCheck.isValid
		if(isValidURL && source != target){
			try {
				if(isAsync){
					const isMentionedCheck = await this.verifyWebmentionAsync(source, target)
					
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
						this.saveToDatabase(source, target)
						return {message: "SUCCESSFULLY RECIEVED WEBMENTION",
							 locationHeader: null, status: 200}
					} else {
						return {message: "Cannot not find the target URL in the source URL provided",
							 locationHeader: null, status: 400}
					}
				}
				
				
			} catch(e){
				console.log(e)
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
	// built-in status page kinda sucks, but that's okay because I want others to write their own static checking logic 
	statusCheck(source, target){
		
		return new Promise((resolve, reject) => {
			WebmentionModel.findOne({ source: "http://localhost:3000/file", target: "http://localhost:3000/target" },function(err, webmention) { 
				if (err){ 
					console.log(err)
					reject(err)
					
				};
				resolve(webmention)
			});
		})
		
	}
	status(source, target){
		return new Promise( (resolve, reject) => {
			
			this.statusCheck(source, target).then(webmention => resolve(webmention)).catch(e => {
			
				reject(e)
			})
		})
		
	}

	saveToDatabase(source, target){
		console.log("saving to local database...")
		console.log(source, target)
		var query = {source: source, target: target,},
		update = { updated: new Date(), isProcessed: true },
		options = { upsert: true, new: true, setDefaultsOnInsert: true , useFindAndModify: false};

		// Find the document
		WebmentionModel.findOneAndUpdate(query, update, options, function(error, result) {
			if (error) return;
			console.log(result)

			// do something with the document
		});
	/*	var savedWebmention = new WebmentionModel({source: source, target: target, updated: new Date()})
		savedWebmention.save(function (err, object) {
			if (err) return console.error(err);
		});*/
	}

	mongoIsBeingProcessed(source, target, addToQueue){
	
		return new Promise(( resolve, reject) => {
		var query = {source: source, target: target,},
		update = { isProcessed: false },
		options = { upsert: true,  setDefaultsOnInsert: true, useFindAndModify: false};

		WebmentionModel.findOneAndUpdate(query, update, options, function(error, result) {
			// this will return the old object without the new update
			if (error) resolve({isProcessing: false, err: error});
			// what if result.updated doens't exists
			if(result.isProcessed){
				addToQueue()	

				resolve({isProcessing: true, err: {message: ""}})
			} else {
				// if is processed is false then it's already being processed
				resolve({isProcessing: true, err: new Error(alreadyBeingProcessedError)})

			}

			

		});
			

	
			
		})
	}
	async verifyWebmentionAsync(source, target){
		return new Promise( (resolve, reject) => {
			
			try {	
				resolve(this.mongoIsBeingProcessed(source, target, () => this.jobsQueue.add({source: source, target: target},  { delay: 5000 })))
				
			} catch (e){
				reject({isProcessing: false, err:e})
			}
		
		})
	
	} 
	/*The receiver SHOULD check that target is a valid resource for which it can accept Webmentions. This check SHOULD happen synchronously to reject invalid Webmentions before more in-depth verification begins. What a "valid resource" means is up to the receiver. For example, some receivers may accept Webmentions for multiple domains, others may accept Webmentions for only the same domain the endpoint is on.*/
	async  verifyWebmentionSync(source, target){
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
}

 
const webmentionSchema = new mongoose.Schema({ source: String, isProcessed: Boolean, target: String, updated: Date,date: { type: Date, default: Date.now }});
var WebmentionModel = mongoose.model('webmention', webmentionSchema);
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





const reciever = new WebmentionReciever()

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
	reciever.status(source, target).then((msg) => {
		res.send(msg)
	}).catch((e) => {
		console.log(e)
		res.status(400)
		res.send("An error occured. Please try again later.")
	})
	
})
app.post('/webmention', async (req, res) => {
	reciever.recieveWebmention(req.body.source, req.body.target).then((data) => {
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
