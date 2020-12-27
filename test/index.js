var expect  = require('chai').expect;
const path = require('path')
const express = require('express')
var request = require('request');
var WebmentionReceiver = require('../webmention.js').WebmentionReceiver
var WebmentionModel = require("../webmention.js").WebmentionModel

// WEBMENTION RECEIVER UNIT TESTS

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
describe("Tests Receiving", function () {

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
        webmention =  new WebmentionReceiver();
        WebmentionModel.remove({}, () => done() )  
    });
    afterEach(function(done) {
        webmention.closeDBConnection().then(()=>done())
    })

    it("Successfully send webmention", function (done){

        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(201);

            expect(data.locationHeader).to.equal("http://localhost:3000/status?source=http://localhost:3000/file&target=http://localhost:3000/target")    
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with source url", function (done){
        webmention.receiveWebmention("fakeprotocol://example.com", "http://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('Source URLs are required to start with http:// or https://')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with target url", function (done){
        webmention.receiveWebmention("http://localhost:3000/file", "fakeprotocol://localhost:3000/target").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('Target URLs are required to start with http:// or https://')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })

    it("Error with sending the same target and source URL", function (done){
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/file").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal( "The source URL cannot equal the target URL")
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })
    it("Error with sending the same target and source URL", function (done){
        webmention.receiveWebmention("http://example.com", "http://example.com/file").then((data) => {
            expect(data.status).to.equal(400)
            expect(data.message).to.equal('We do not support sending Webmentions to that target URL')
            expect(data.locationHeader).to.equal(null)
            done()
        }).catch((e) => console.log(e))
    })

    it("Send and receive successful status", function (done) {
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{ 
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
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target")
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
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
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/nonExistentTarget").then((data) =>{
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
        webmention.receiveWebmention("http://localhost:3000/tooLongToLoadFile", "http://localhost:3000/target").then((data) =>{
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
        webmention.receiveWebmention("https://www.nicowil.me/posts/adding-additon-to-js", "http://localhost:3000/target").then((data) =>{
            expect(data.status).equal(201)
            done()
         })
    })

    it("Update a document", function (done){
        this.timeout(4000)
        webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
            expect(data.status).equal(201)
            setTimeout( () => {
                webmention.receiveWebmention("http://localhost:3000/file", "http://localhost:3000/target").then((data) =>{
                    expect(data.status).equal(201)
                    done()
             })
            },1000)
            
         })
    })
    
})