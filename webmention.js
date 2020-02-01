const mongoose = require('mongoose');
const { http, https } = require('follow-redirects');
var cors = require('cors')
var sanitizeHtml = require('sanitize-html');
const cheerio = require('cheerio')
const uuidv4 = require('uuid/v4');
const followRedirects = require('follow-redirects')
followRedirects.maxRedirects = 10;
var Queue = require('bull');

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
		this.delayProcessing = 0
		this.jobsQueue = new Queue('verfiying', REDIS_URL);
		this.jobsQueue.process((job, done) => {

			// job.data contains the custom data passed when the job was created
			// job.id contains id of this job.
		
			const source = job.data.source
			const target = job.data.target
			
			// if it's mentioned the job will be complete, and it will call the callback
			this.verifyWebmentionSync(source, target).then((value) =>{
				if(value.isIncluded){
					this.saveToDatabase(source, target, value.document)
				} else {
					this.saveToDatabase(source, target, null, true, "Could not verify that source included target")
				}
				done();
			}).catch((e) => {
				console.log(e)
				this.saveToDatabase(source, target, null , true, e.message)
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
						if(err.message == alreadyBeingProcessedError){
							
							return {message: "Your request is being processed. Please wait at least one minute before trying again.",
							 locationHeader: null, status: 400}
						} else {
							return {message: "Error in processing. Please try again.",
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
			WebmentionModel.findOne({ source: source, target: target },function(err, webmention) { 
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
	saveToDatabase(source, target, document, hasError=false, errMsg=null){
		console.log("saving to local database...")
		console.log(source, target)
		var query = {source: source, target: target,},
		update = { updated: new Date(), isProcessed: true, hasError: hasError, errMsg: errMsg, document: document, },
		options = {  upsert: true, new: true, setDefaultsOnInsert: true , useFindAndModify: false};

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
		update = { isProcessed: false,  hasError: false, errMsg: null },
		options = { upsert: true,  setDefaultsOnInsert: true, useFindAndModify: false};

		WebmentionModel.findOneAndUpdate(query, update, options, function(error, result) {
			// this will return the old object without the new update
			if (error) resolve({isProcessing: false, err: error});
			// if it's brand new then the result will be null, that means we can just add it directly to the queue
			if(result){
				if(result.isProcessed){
					addToQueue()	
					resolve({isProcessing: true, err: {message: ""}})
				} else {
					// if is processed is false then it's already being processed
					resolve({isProcessing: true, err: new Error(alreadyBeingProcessedError)})
	
				}
			} else {
				addToQueue()	
	
				resolve({isProcessing: true, err: {message: ""}})
			}
			

			

		});
			

	
			
		})
	}

	parseComment(document){
		const $ = cheerio.load(document)
		var date = $('.dt-published').text()
		if(date == ""){
			date = new Date()
		}
		var text = $('.e-content').text()
		// should trunucate
		// if no e-content or e-content is too long
		if(text == ""){
			text = $(".p-summary").text()
			// if p-summary is also blank use p-name
			if(text == "")	{
				text = $('.p-name').text()
			}
		} 
		text = sanitizeHtml(text, {
			allowedTags: [ 'b', 'i', 'em', 'strong', 'a' ],
			allowedAttributes: {
			  'a': [ 'href' ]
			},
			allowedIframeHostnames: ['www.youtube.com']
		});
		console.log(date)
		return {date: date , text: text}
	}

	async verifyWebmentionAsync(source, target){
		return new Promise( (resolve, reject) => {
			
			try {	
				resolve(this.mongoIsBeingProcessed(source, target, () => this.jobsQueue.add({source: source, target: target},  { delay: this.delayProcessing })))
				
			} catch (e){
				reject({isProcessing: false, err:e})
			}
		
		})
	
	} 
	/*The receiver SHOULD check that target is a valid resource for which it can accept Webmentions. This check SHOULD happen synchronously to reject invalid Webmentions before more in-depth verification begins. What a "valid resource" means is up to the receiver. For example, some receivers may accept Webmentions for multiple domains, others may accept Webmentions for only the same domain the endpoint is on.*/
	async  verifyWebmentionSync(source, target){
	// verify that the target url is mentioned in the source
	return new Promise( (resolve, reject) => {
        var beginRequest;
        console.log("SOURCE",new URL(source).protocol, process.env.LOCAL)
		if(new URL(source).protocol == 'http' || new URL(source).protocol == "http:" || process.env.LOCAL){
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
			res.on('data',  (body) => {
				
				try{
					//checking for an exact match, not using per-media-type rules to determine whether target is in the source document
					
					resolve({isIncluded: body.includes(target), document: this.parseComment(body)})
					
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

 
const webmentionSchema = new mongoose.Schema({ source: String, document: {date: String, text: String}, isProcessed: Boolean, target: String, hasError: Boolean, errMsg: String ,updated: Date,date: { type: Date, default: Date.now }});
var WebmentionModel = mongoose.model('webmention', webmentionSchema);
exports.WebmentionReciever = WebmentionReciever
exports.WebmentionModel = WebmentionModel
