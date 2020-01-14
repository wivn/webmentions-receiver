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
		this.jobsQueue.process((job, done) => {

			// job.data contains the custom data passed when the job was created
			// job.id contains id of this job.
		
			const source = job.data.source
			const target = job.data.target
			
			// if it's mentioned the job will be complete, and it will call the callback
			reciever.verifyWebmentionSync(source, target).then((value) =>{
				if(value){
					reciever.saveToDatabase(source, target)
				} else {
					reciever.saveToDatabase(source, target, true ,"Could not verify that source included target")
				}
				done();
			}).catch((e) => {
				console.log(e)
				this.saveToDatabase(source, target, true, e.message)
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
		const urlValidityCheck = this.checkURLValidity(source, target)
		const isValidURL = urlValidityCheck.isValid
		if(isValidURL && source != target){
			try {
					const isMentionedCheck = await this.verifyWebmentionAsync(source, target)
					
					if(isMentionedCheck.isProcessing && isMentionedCheck.err.message == ""){
							const statusURL = `${statusURLBase}?source=${source}&target=${target}`
							return {message: "You can check the progress at " + statusURL, locationHeader: statusURL, status: 201}
					} else {
                        const err = isMentionedCheck.err
                        return {message: err.message, locationHeader: null, status: 400}
					
				}
			} catch(e){
				return {message: e.message,
							 locationHeader: null, status: 400}
            }
        } else {
			return {message: "Error",
				locationHeader: null, status: 400}
		}
			

	}
	status(source, target){
		return new Promise( (resolve, reject) => {
			
			WebmentionModel.findOne({ source: source, target: target },function(err, webmention) { 
				if (err){ 
					console.log(err)
					reject(err)
					
				};
				resolve(webmention)
			});
		
		})
		
	}
	
	saveToDatabase(source, target, hasError=false, errMsg=null){
		console.log("saving to local database...")
		var query = {source: source, target: target,},
		update = { updated: new Date(), isProcessed: true, hasError: hasError, errMsg: errMsg },
		options = { upsert: true, new: true, setDefaultsOnInsert: true , useFindAndModify: false};

		// Find the document
		WebmentionModel.findOneAndUpdate(query, update, options, function(error, result) {
			if (error) return;
			console.log(result)

			// do something with the document
		});
	}
	async verifyWebmentionAsync(source, target){
		return new Promise( (resolve, reject) => {
			
			try {	
				var query = {source: source, target: target,},
				update = { isProcessed: false,  hasError: false, errMsg: null },
				options = { upsert: true,  setDefaultsOnInsert: true, useFindAndModify: false};

				WebmentionModel.findOneAndUpdate(query, update, options, (error, result) => {
					// this will return the old object without the new update
					if (error) resolve({isProcessing: false, err: error});
					// if it's brand new then the result will be null, that means we can just add it directly to the queue
					if(result){
						if(result.isProcessed){
							this.jobsQueue.add({source: source, target: target},  { delay: 5000 })	
			
							resolve({isProcessing: true, err: {message: ""}})
						} else {
							// if is processed is false then it's already being processed
							resolve({isProcessing: true, err: new Error(alreadyBeingProcessedError)})
			
						}
					} else {
						this.jobsQueue.add({source: source, target: target},  { delay: 5000 })	
			
						resolve({isProcessing: true, err: {message: ""}})
					}
					

					

				}); 
				
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
		if(new URL(source).protocol == 'http:'){
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

 
const webmentionSchema = new mongoose.Schema({ source: String, isProcessed: Boolean, target: String, hasError: Boolean, errMsg: String ,updated: Date,date: { type: Date, default: Date.now }});
var WebmentionModel = mongoose.model('webmention', webmentionSchema);
function getWebmentions(callback){
	WebmentionModel.find(function (err, webmentions) {
		if (err) return console.error(err);
		callback(webmentions);
	})

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
const path = require('path')
var bodyParser = require('body-parser')
const app = express()
const port =  process.env.PORT || 3000
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
 
// parse application/json
app.use(bodyParser.json())
// Require static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Set 'views' directory for any views 
// being rendered res.render()
app.set('views', path.join(__dirname, 'views'));

// Set view engine as EJS
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.get('/file', (req,res) => {
	app.set('Content-Type', 'text/html; charset=utf-8')
	setTimeout(function () {
        res.sendFile('/Users/nicolaswilhelm/Desktop/url-organizer/webmentions/folder/index.html')
    }, 0);
	
})
app.get('/', (req, res) => {
	
	res.send("called")
	
})

// if status page doesnt exist wonky error, fix that TODO clearly not working properly
app.get('/status', function(req, res){
	const source = req.query.source
	const target = req.query.target
	reciever.status(source, target).then((msg) => {
		if(msg){
			res.json( msg);
		} else {
			res.json({err: "That source-target combination does not exist. Please make sure you have entered them correctly or correctly sent a webmention."})
		}
		
	}).catch((e) => {
		console.log(e)
		res.status(400)
		res.json({err:  "An error occured. Please try again later."})
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
		sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
		res.text().then((body) => console.log(body))
	})
	
	
})
