const fetch = require('node-fetch');
const { http, https } = require('follow-redirects');
const followRedirects = require('follow-redirects')
followRedirects.maxRedirects = 10;
var formurlencoded = require('form-urlencoded').default;

function sendWebMention(source, target, webmentionEndpoint, callback){
	fetch(webmentionEndpoint, {
		// make this more secure, use urlencoded
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
	res.sendFile('/Users/nicolaswilhelm/Desktop/url-organizer/webmentions/folder/index.html')
})
app.get('/', (req, res) => {
	
	res.send("called")
	
})

app.post('/webmention', async (req, res) => {
	console.log("recieved webmention")
	const source = req.body.source
	const target = req.body.target
	const isMentioned = await verifyWebmentionSync(source, target)
	console.log(isMentioned)
	const isValidURL = checkURLValidity(source, target)
	
	// need an async option
	if(isValidURL && isMentioned && source != target){
		
		res.status(200)
		res.send("SUCCESSFULLY RECIEVED WEBMENTION")
	}
})

// async function verifyWebmentionAsync 

/*The receiver SHOULD check that target is a valid resource for which it can accept Webmentions. This check SHOULD happen synchronously to reject invalid Webmentions before more in-depth verification begins. What a "valid resource" means is up to the receiver. For example, some receivers may accept Webmentions for multiple domains, others may accept Webmentions for only the same domain the endpoint is on.*/
async function verifyWebmentionSync(source, target){
	// verify that the target url is mentioned in the source
	/* 
	The receiver SHOULD use per-media-type rules to 
	determine whether the source document mentions the target URL. For example, 
	in an [ HTML5] document, the receiver should look for <a href="*">, 
	<img href="*">, <video src="*"> and other similar links. 
	In a JSON ([RFC7159]) document, the receiver should look for properties 
	whose values are an exact match for the URL. If the document is plain text, 
	the receiver should look for the URL by searching for the string. Other content 
	types may be handled at the implementer's discretion. The source document MUST 
	have an exact match of the target URL provided in order for it to be considered a 
	valid Webmention.

	*/
	
	return new Promise(function (resolve, reject){
		
		http.get(source, (res) => {
			
			res.setEncoding('utf8');
			res.on('data', function (body) {
				try{
					resolve(body.includes(target))
				} catch(e){
					reject(e)
				}
				 
			});
		});
	
	})
	
}

/*
The receiver SHOULD check that target is a valid resource for which it can accept Webmentions. This check SHOULD happen synchronously to reject invalid Webmentions before more in-depth verification begins. What a "valid resource" means is up to the receiver. For example, some receivers may accept Webmentions for multiple domains, others may accept Webmentions for only the same domain the endpoint is on.

Don't knwo what this means for the last part about target
*/
function checkURLValidity(source, target){
	try {
		const sourceURL = new URL(source)
		const targetURL = new URL(target)
		
		if(sourceURL.protocol != "http:" && sourceURL.protocol != "https:"){	
			throw Error("Incorrect protocol for source url")
		}
		if(targetURL.protocol != "http:" && targetURL.protocol != "https:"){
			throw Error("Incorrect protocol for target url")
		}

	} catch(err){
		return false
	}
	return true
}


app.listen(port, () =>{ 
	sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
		res.text().then((body) => console.log(body))
		console.log("called webmention")
	})
	console.log(`Example app listening on port ${port}!`)
})
