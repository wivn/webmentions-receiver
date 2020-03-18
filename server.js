// MAIN PROGRAM
var cors = require('cors')
var WebmentionReciever = require('./webmention.js').WebmentionReciever
var WebmentionModel = require("./webmention.js").WebmentionModel
const followRedirects = require('follow-redirects')
followRedirects.maxRedirects = 10;

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
		
        res.sendFile(path.resolve('test/index.html') )
    }, 0);
	
})
app.get('/', (req, res) => {
	
	res.send("called")
	
})

app.get('/seeWebmentions', (req, res) => {
	getWebmentions((data) => res.json(data))
})

function sendStatus(req, res, data){
	if(!(req.get('Accept') === 'application/json')) {
        res.render("status", data);
    } else {
		res.json(data)
	}
}
app.get('/status', function(req, res){
	const source = req.query.source
	const target = req.query.target
	reciever.status(source, target).then((msg) => {
		if(msg){
			sendStatus(req, res, {data: msg, err: null});
		} else {
			sendStatus(req, res, {data: null, err: "That source-target combination does not exist. Please make sure you have entered them correctly or correctly sent a webmention."})
		}
		
	}).catch((e) => {
		console.log(e)
		res.status(400)
		sendStatus(req, res, {data: null, err:  "An error occured. Please try again later."})
	})
	
})

app.post('/webmention', async (req, res) => {
	reciever.recieveWebmention(req.body.source, req.body.target).then((data) => {
		res.status(data.status)
		if(data.locationHeader){
			res.set('Location', data.locationHeader)
			res.render('recieved', {message:data.message, url: data.locationHeader})

		}  else {
			// note that the sync stuff will go here too, so it'll look like it failed
			res.render('error-recieved', {message:data.message})
		}
		console.log(data.message)
		
	}).catch((e) => console.log(e))
	
})
app.get("/webmentions",  cors(), (req, res) => {
	var target = req.query.target
	console.log(target)
	WebmentionModel.findOne({ target: target },function(err, webmention) { 
		if (err){ 
			console.log(err)
			res.send("Can't find")
			
		};
		res.json(webmention)
	});
})
app.listen(port, () =>{ 
	if(process.env.LOCAL){
		sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
		res.text().then((body) => console.log(body))
	})
	}
	
})
