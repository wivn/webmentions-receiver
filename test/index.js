var expect  = require('chai').expect;
var request = require('request');
describe('Stanity tests', function() {
    it('Page loads', function(done) {
        request('http://localhost:3000' , function(error, response) {
            expect(response.statusCode).to.equal(200);
            done();
        });
    })
})

// WEBMENTION RECIEVER UNIT TESTS








// END TO END TEST (Checks how HTML renders and then JSON from status)
describe('Basic Webmention Sending Tests', function (){
    it("Send Webmention Successfully", function(done){
        sendWebMention("http://localhost:3000/file", "http://localhost:3000/target", "http://localhost:3000/webmention", function (res, error){
            res.text().then((body) =>{ 
                expect(body).to.include("Recieved webmention!")
            }).then(() => {
                // request with Header Content-type application/json that way I can deal with JSON instead of the HTML
                request({url:"http://localhost:3000/status?source=http://localhost:3000/file&target=http://localhost:3000/target ", headers: {
                    'Accept': "application/json",
                }}, function(err, resp, body){
                    const data = JSON.parse(body).data
                    expect(data.isProcessed).equal(true)
                    done()
                })
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
}