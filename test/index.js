var expect  = require('chai').expect;
var request = require('request');
var WebmentionReciever = require('../webmention.js').WebmentionReciever
var WebmentionModel = require("../webmention.js").WebmentionModel
describe('Stanity tests', function() {
    it('Page loads', function(done) {
        request('http://localhost:3000' , function(error, response) {
            expect(response.statusCode).to.equal(200);
            done();
        });
    })
})

// WEBMENTION RECIEVER UNIT TESTS
describe("Unit Tests Recieving", function () {
    // if i move         var webmention =  new WebmentionReciever() to here it goes wonky why?
    var webmention =  new WebmentionReciever()
    beforeEach(function(done) {
        WebmentionModel.remove({}, () => done() )
    });

    it("Successfully send webmention", function (done){
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(201);
            expect(data.locationHeader).to.equal("http://localhost:3000/status?source=http://localhost:3000/file&target=http://localhost:3000/target")    
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with source url", function (done){
        webmention.recieveWebmention("fakeprotocol://example.com", "http://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('Source URLs are required to start with http:// or https://')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with target url", function (done){
        webmention.recieveWebmention("http://localhost:3000/file", "fakeprotocol://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('Target URLs are required to start with http:// or https://')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })

    it("Error with sending the same target and source URL", function (done){
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/file").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal( "The source URL cannot equal the target URL")
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with sending the same target and source URL", function (done){
        webmention.recieveWebmention("http://example.com", "http://example.com/file").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('We do not support sending Webmentions to that target URL')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })

    it("Send and recieve successful status", function (done) {
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{ 
            expect(data.status).to.equal(201);
            expect(data.locationHeader).to.equal("http://localhost:3000/status?source=http://localhost:3000/file&target=http://localhost:3000/target")  
            setTimeout( () => {
                webmention.status("http://localhost:3000/file", "http://localhost:3000/target").then((data) => {
                    expect(data.isProcessed).equal(true)
                    done()
                }
            )
            },100)
            
            })
        })
    
    it("Check a status for something that doesn't exist", function (done){
        webmention.status("http://example.com", "https://example.com/target").then((data) => {
            console.log("running the test")
            expect(data).equal(null)
            done()
        })
    })

    it("Check document parser", function (done){
        var data = webmention.parseComment(`<!doctype html>
        <html>
          <body>
              <time class="dt-published" datetime="2013-06-13 12:00:00">13th June 2013</time>
            <div class="e-content"><a class="u-in-reply-to" href="http://localhost:3000/target">I am using node.js for webmention</a></div>
            <a class="u-in-reply-to" href="https://webmention.rocks/update/1/part/2">#2</a>
        
          </body>
        </html>`)
        expect(data.date).equal('13th June 2013')
        expect(data.text).equal("I am using node.js for webmention")
        done()
    })
})





/*

// END TO END TEST (Checks how HTML renders and then JSON from status)
describe('Basic Webmention Sending Tests', function (){
    it("Send Webmention Successfully", function(done){
        sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
            res.text().then((body) =>{ 
                expect(body).to.include("Recieved webmention!")
            }).then(() => {
                // request with Header Content-type application/json that way I can deal with JSON instead of the HTML
                setTimeout(function () {
                    request({url:"http://localhost:3000/status?source=http://localhost:3000/file&target=http://localhost:3000/target ", headers: {
                    'Accept': "application/json",
                }}, function(err, resp, body){
                    const data = JSON.parse(body).data
                    console.log(data.isProcessed)
                    expect(data.isProcessed).equal(true)
                    done()
                })
                  }, 100);
                
            })
        })
        
        
    })
    

})*/
// can check HTML here for webmention sending
// try every single error
const fetch = require('node-fetch');
var formurlencoded = require('form-urlencoded').default;
function sendWebMention(source, target, webmentionEndpoint, callback){
	fetch(webmentionEndpoint, {
	  body: formurlencoded({source: source, target: target}),
	  headers: {
        "Content-Type": "application/x-www-form-urlencoded",
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