// REDIS URL
var redis = require("redis"),
    client = redis.createClient();
client.on("error", function (err) {
    console.log("Error " + err);
});

var uuid = require('node-uuid');
var Queue = require('bull');
// REDIS URL
var jobsQueue = new Queue('verfiying', 'redis://127.0.0.1:6379');

const fetch = require('node-fetch');
const { http, https } = require('follow-redirects');
const followRedirects = require('follow-redirects')
followRedirects.maxRedirects = 10;
var formurlencoded = require('form-urlencoded').default;
var validResourceHost = "localhost:3000"
const sourceURLProtocolError = "Incorrect protocol for source url"
const targetURLProtocolError = "Incorrect protocol for target url"
const sourceURLTookTooLongToLoad = "Too long to load source"
const alreadyBeingProcessedError = "AlreadyBeingProcessed"
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
const port = 3000
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
/* TODO:
- add async version of verification (DONE)
	- add status page (	 maybeeeeeeeeeeeeeeee later return a page where they can look back for updates)
)
	- if the same URL and source are sent multiple times, only check once then wait at least 1 minute before processing again (I can also add a rate limit to the service) (DONE)
 check if the url with that target exists, if it does return that they will have to wait a minute before sending again (DONE)

	 if it doesn't exist, add it to the job queue to be dealt with and (DONE)

	 in the job queue it'll run the verifyWebmentionSync code and if it works out, then run the save to database callback provided by the user (DONE)
- add time limit to checking to make sure it doesn't make me wait forever (DONE)
- also add 1 mb limit, once it trys to download more of that I know it's abuse (DONE)
- convert to function with callback so can be used to save stuff to database (DONE)
*/
async function recieveWebmention(req, res){
	const isAsync = true
	const source = req.body.source
	const target = req.body.target
	const urlValidityCheck = checkURLValidity(source, target)
	const isValidURL = urlValidityCheck.isValid
	if(isValidURL && source != target){
		try {
			if(isAsync){
				const isMentionedCheck = await verifyWebmentionAsync(source, target)
				
				if(isMentionedCheck.isProcessing && isMentionedCheck.err.message == ""){
					// response 202 because there is no status page and realistically it shouldn't take too long to run
					res.status(202)
					res.send("Your request will now be processed. Your Webmention should appear shortly.")
					//res.send("Check on progress at: " + id)
				} else {
					res.status(400)
					const err = isMentionedCheck.err
					if(err.message == alreadyBeingProcessedError){
						res.send("Your request is being processed. Please wait at least one minute before trying again.")
					} else {
						res.send("Error in processing. Please try again.")
					}
				}
				
				
			} else {
				const isMentioned = await verifyWebmentionSync(source, target)
				if(isMentioned){
					res.status(200)
					saveToDatabase()
					res.send("SUCCESSFULLY RECIEVED WEBMENTION")
				} else {
					res.status(400)
					res.send("Cannot not find the target URL in the source URL provided")
				}
			}
			
			
		} catch(e){
			res.status(400)
			res.send("Error with loading source URL")
		}
		
	} else {
		
		res.status(400)
		const urlValidityErrorMessage = urlValidityCheck.err.message
		if(urlValidityErrorMessage == sourceURLProtocolError){
			res.send("Source URLs are required to start with http:// or https://")
		} else if(urlValidityErrorMessage == targetURLProtocolError){
			res.send("Target URLs are required to start with http:// or https://")
		} else if (source == target){
			res.send("The source URL cannot equal the target URL")
		} else {
			res.send("We do not support sending Webmentions to that target URL")
		} 
		
		
	}
}
app.post('/webmention', async (req, res) => {
	recieveWebmention(req, res).catch((e) => console.log(e))
	
})
function saveToDatabase(){
	console.log("saving to local database...")
}
jobsQueue.process(function(job, done){

	// job.data contains the custom data passed when the job was created
	// job.id contains id of this job.
  
	const source = job.data.source
	const target = job.data.target
	
	// if it's mentioned the job will be complete, and it will call the callback
	verifyWebmentionSync(source, target).then((value) =>{
		if(value){
			saveToDatabase()
		}
		done();
	}).catch((e) => {
		console.log(e)
		done();
	})
	
	
  
  });
const KEY_EXP = 10
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
		
		const request = http.get(source, (res) => {
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

// checks that URL is either http or https and that it's including the host url
function checkURLValidity(source, target){
	try {
		const sourceURL = new URL(source)
		const targetURL = new URL(target)
		
		if(sourceURL.protocol != "http:" && sourceURL.protocol != "https:"){	
			throw Error(sourceURLProtocolError)
		}
		if(targetURL.protocol != "http:" && targetURL.protocol != "https:"){
			throw Error(targetURLProtocolError)
		}
		// only other check is valid resource
		return {isValid: targetURL.host == validResourceHost, err: {message: ""} }
	} catch(err){
		return {isValid: false, err: err}
	}
}


app.listen(port, () =>{ 
	sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
		res.text().then((body) => console.log(body))
	})
})
