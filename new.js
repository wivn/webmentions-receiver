const cheerio = require("cheerio")
const fetch = require('node-fetch');

fetch("https://webmention.rocks/test/1")
.then(function(res){
	const finalURL = res.url
	// moved variable aboves
	var linkURL;
	// new code
	if(res.headers.get('Link')){

   // split all link headers by comma
   const linkURLFromHeaderUncleaned = res.headers.get('Link').split(",")
   	// then split the site from the rel
   	.map(linkHeader => linkHeader.split(";") )
   	// then check that the rel includes the word webmention
   	.filter(linkHeader => linkHeader[1].split("rel=")[1].includes("webmention"))

   	const cleanedLinkURL = linkURLFromHeaderUncleaned[0][0].trim()
   	// remove arrows from URL and give it as an argument to the relativizeURL function

   	 linkURL = relativizeURL( cleanedLinkURL .substring(1, cleanedLinkURL.length -1), "https://webmention.rocks", finalURL)
   }
   // new code
   return Promise.all([res.text(), res.headers.get('content-type').includes('text/html'), linkURL, finalURL])

})
.then(function([body, isHTML, linkURL, finalURL]){
	if(!linkURL && isHTML){
		const $ = cheerio.load(body)
		const linkElement = $('link[rel~="webmention"]')
		const aElement = $('a[rel~="webmention"]')
		const linkElementURL = linkElement.attr('href')
		const aLinkElementURL = aElement.attr('href')
		if(linkElementURL == "" || aLinkElementURL == ""){
			return finalURL
		}
		// the second should only be the case if no aLinkElementURL exists
		if(linkElement.index() < aElement.index() && linkElementURL){
			// link is before a 
			return relativizeURL(linkElementURL, host, finalURL)
		}
		// if the a element is before the link element OR
		// if both indexes don't exist and the other element doesn't exist then run it
		if(aElement.index() < linkElement.index() && aLinkElementURL){
			return relativizeURL(aLinkElementURL, host, finalURL)
		}
		// if it matches none of the above (in the scenario where a link tag is before a tag) and the link is blank
		if(!linkElementURL && aLinkElementURL){
			return relativizeURL(aLinkElementURL, host, finalURL)
		}
		if(!aLinkElementURL && linkElementURL){
			return relativizeURL(linkElementURL, host, finalURL)
		}
	} else {
		return linkURL
	}
})
.then(function(link){
	console.log(link)
})
.catch(function(error){
    console.log(error)
})

function relativizeURL(url, host, finalURL){
		var beginsWithHttp = null
		try {
			// check if it's a correctly formatted url with the right protocol
			const urlProtocol = new URL(url).protocol
			beginsWithHttp = urlProtocol == "https:" || urlProtocol == "http:"
		} catch(err){
			// if not correctly formatted as a URL (must be relative)
			beginsWithHttp = false	
		}
				
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
		// if it's an absolute URL it can be returned easily, 
		// if it's a normal relative URL it can be made absolute by adding the host part
		if(beginsWithHttp){
			return url
		} else {
			return host + url

		}
}