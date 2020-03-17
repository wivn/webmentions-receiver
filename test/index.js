var expect  = require('chai').expect;
const path = require('path')
const express = require('express')
var request = require('request');
var WebmentionReciever = require('../webmention.js').WebmentionReciever
var WebmentionModel = require("../webmention.js").WebmentionModel
/*describe('Stanity tests', function() {
    it('Page loads', function(done) {
        request('http://localhost:3000' , function(error, response) {
            expect(response.statusCode).to.equal(200);
            done();
        });
    })
})
*/
// WEBMENTION RECIEVER UNIT TESTS

function createTestServingFile(){
    const app = express()
    app.get('/file', (req,res) => {
        app.set('Content-Type', 'text/html; charset=utf-8')
        setTimeout(function () {
            res.sendFile(path.resolve('../test/index.html'))
        }, 0);
        
    })
    app.get("/tooLongToLoadFile", (req, res) => {
        app.set('Content-Type', 'text/html; charset=utf-8')
        setTimeout(function () {
            res.sendFile(path.resolve('../test/index.html'))
        }, 5001);
    })
    
    return app
}
describe("Unit Tests Recieving", function () {
    // if i move         var webmention =  new WebmentionReciever() to here it goes wonky why?
    var webmention;
    var server;
    before(function(done) {
        // runs once before the first test in this block
        var app = createTestServingFile()
        server = app.listen(3000, function () {done()})
      })
    
      after(function(done) {
        // runs once after the last test in this block
        server.close(done)
    })
    beforeEach(function(done) {
        webmention =  new WebmentionReciever();
        WebmentionModel.remove({}, () => done() )  
    });
    afterEach(function(done) {
        webmention.closeDBConnection().then(()=>done())
    })

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
            // this needs to match the process delay
            },400)
            
            })
        })
    
    it("Check a status for something that doesn't exist", function (done){
        webmention.status("http://example.com", "https://example.com/target").then((data) => {
            expect(data).equal(null)
            done()
        })
    })

    it("Check that I can't send something too fast", function (done){
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target")
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
            expect(data.message).equal("Your request is being processed. Please wait at least one minute before trying again.")
            expect(data.status).equal(400)
            
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

    it("Does not include target", function (done){
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/nonExistentTarget").then((data) =>{
            expect(data.status).equal(201)
            setTimeout( () => {
                webmention.status("http://localhost:3000/file", "http://localhost:3000/nonExistentTarget").then((statusData) => {
                    expect(statusData.isProcessed).equal(true)
                    expect(statusData.hasError).equal(true)
                    expect(statusData.errMsg).equal("Could not verify that source included target")
                    done()
                }
            )
            // this needs to match the process delay
            },400)
         })
    })
    it("Source takes too long", function (done){
        this.timeout(3000)
        webmention.recieveWebmention("http://localhost:3000/tooLongToLoadFile", "http://localhost:3000/target").then((data) =>{
            expect(data.status).equal(201)
            setTimeout( () => {
                webmention.status("http://localhost:3000/tooLongToLoadFile", "http://localhost:3000/target").then((statusData) => {
                    console.log(statusData)
                    done()
                }
            )
            // this needs to match the process delay
            },400)
         })
    })
    it("Error for status", function (done){
        webmention.status("http://localhost:3000/fakeSource", "http://localhost:3000/fakeTarget").then((statusData) => {
            expect(statusData).equal(null)
            done()
        }).catch((e) => console.log(e))
    })

    it("Check document parser can parse more spare documents", function (done){
        var data = webmention.parseComment(`<!doctype html>
        <html>
          <body>
            <div class="p-name">Hello!</div>        
          </body>
        </html>`)
        expect(data.text).equal('Hello!')
        expect(data.date.getDate()).equal(new Date().getDate())
        done()
    })

    it("Use an https link for the source", function (done){
        webmention.recieveWebmention("https://www.nicowil.me/posts/adding-additon-to-js", "http://localhost:3000/target").then((data) =>{
            expect(data.status).equal(201)
            done()
         })
    })

    it("Update a document", function (done){
        this.timeout(2500)
        webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
            expect(data.status).equal(201)
            setTimeout( () => {
                webmention.recieveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
                    expect(data.status).equal(201)
                    done()
             })
            },1000)
            
         })
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
    

})
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
}*/