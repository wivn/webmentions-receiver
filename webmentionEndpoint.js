const fetch = require('node-fetch');
const cheerio = require('cheerio')
var formurlencoded = require('form-urlencoded').default;
var Url = require('url-parse');


const urlToSendWebmentionTo = "https://webmention.rocks/test/21"
const host = new Url(urlToSendWebmentionTo).origin;

async function getWebmentionEndpoint(host, urlToSendWebmentionTo){
	return fetch(urlToSendWebmentionTo)
	    .then(function (res) { 
	    	var linkURL;
	    	const finalURL = res.url

	    	if(res.headers.get('Link')){
	    		// split all link headers by comma
	    		// then split the site from the rel
	    		// then check that the rel includes the word webmention
	    		// this will return an array, which has an array in it with two elements, the first is the webmention
	    		
		    	const linkURLFromHeader = res.headers.get('Link').split(",")
	    			.map(linkHeader => linkHeader.split(";") )
	    			.filter(linkHeader => linkHeader[1].split("rel=")[1].includes("webmention"))[0][0].trim()
	    			//res.headers.get('Link').split(';')[0]
		    			// remove arrow brackets

		    	linkURL = relativizeURL( linkURLFromHeader .substring(1, linkURLFromHeader.length -1), host, finalURL)
		    }
	    	return Promise.all([res.text(), res.headers.get('content-type').includes('text/html'), linkURL, finalURL])
	    }).then(([body, isHTML, linkURL, finalURL]) => {
	    	// if the headers have a link everything else is ignored
	    	if(!linkURL){
	    		if(isHTML){
	    			const $ = cheerio.load(body)

	    			const linkElement = $('link[rel~="webmention"]')
	    			const aElement = $('a[rel~="webmention"]')

	    			
	    			const linkElementURL = linkElement.attr('href')
	    			const aLinkElementURL = aElement.attr('href')
	    			if(linkElementURL == "" || aLinkElementURL == ""){
	    				return urlToSendWebmentionTo
	    			}
	    			// the second should only be the case if no aLinkElementURL exists
	    			if(linkElement.index() < aElement.index() && linkElementURL){ //|| linkElement.index() != -1 && aElement.index == -1 && linkElementURL){
	    				// link is before a 
	    				return relativizeURL(linkElementURL, host, finalURL)



	    			}
	    			// if the a element is before the link element OR
	    			// if both indexes don't exist and the other element doesn't exist then run it

	    			if(aElement.index() < linkElement.index() && aLinkElementURL){ // || aElement.index() != -1 && linkElement.index == -1 && aLinkElementURL){
	    				return relativizeURL(aLinkElementURL, host, finalURL)

	    			}
	    			// if it matches none of the above (in the scenario where a link tag is before a tag) and the link is blank
	    			if(!linkElementURL && aLinkElementURL){
	    				return relativizeURL(aLinkElementURL, host, finalURL)
	    			}
	    			if(!aLinkElementURL && linkElementURL){
	    				return relativizeURL(linkElementURL, host, finalURL)
	    			}
	    		}
	    	} else {
	    		return linkURL
	    	}
	    })
	    .then(url =>  ({url:url, err: undefined}))
	    .catch(err => ({url: undefined,err:err}))

	function relativizeURL(url, host, finalURL){
		// possible bug if webmention endpoint is relative to page rather than host and it starts with https:// or http://
		var beginsWithHttp = null
		try {
			const urlProtocol = new URL(url).protocol
			beginsWithHttp = urlProtocol == "https:" || urlProtocol == "http:"
		} catch(err){
			// if not correctly formatted as a URL (must be relative)
			beginsWithHttp = false	
		}
		
		//const beginsWithHttp = urlProtocol == "https:" || urlProtocol == "http:"

		//const beginsWithHttp = url.substring(0, 8) == "https://" || url.substring(0, 7) == "http://"
		// can use new URL to check protcol instead of this ugly hack!!!!!
		
		// if it doesn't begin with http and it doesnt start with a slash to indicate a page relative to the host
		if(!beginsWithHttp && url.substring(0,1) != "/"){
			// remove last part of slash and add url ONLY if last part of slash IS NOT included in the url piece
			const indexOfLastSlash = urlToSendWebmentionTo.lastIndexOf("/")
			const pieceOfURLOfLastSlash = urlToSendWebmentionTo.substring(indexOfLastSlash+1, urlToSendWebmentionTo.length)
			if(url.includes(pieceOfURLOfLastSlash)){
				const nonRelativeLink = urlToSendWebmentionTo.substring(0, urlToSendWebmentionTo.lastIndexOf("/"))
				return nonRelativeLink + "/" + url
			} else {
				// correct location for redirect
				return finalURL.substring(0, finalURL.lastIndexOf("/")) + "/" +url

			}
			
		}
		if(beginsWithHttp){
			return url
		} else {
			return host + url

		}
	}
}
(async () => {
   const endpointURL = await getWebmentionEndpoint(host, urlToSendWebmentionTo)
   console.log(endpointURL.url)
})()

function sendWebMention(source, target, webmentionEndpoint, callback){
	fetch(webmentionEndpoint, {
		// make this more secure, use urlencoded
	  body: formurlencoded({source: source, target: target}),
	  headers: {
	    "Content-Type": "application/x-www-form-urlencoded"
	  },
	  method: "POST"
	})
	.then(res => res.text())
    .then(body => console.log(body))
	/*.then(res => {
		// make the response an object, if it worked set success, if not don't
		callback(res, undefined)
	}
	)*/
	.catch(err => 
		callback(undefined, err)
	)
}













