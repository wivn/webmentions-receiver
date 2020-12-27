# Webmention Receiver

The following project implements a Webmention receiver according to the specification as outlined [here](https://www.w3.org/TR/webmention/). Webmention is a powerful way to submit comments across websites as well as other interactive data.

## Getting Started

In order to get this project running on your own machine, there's a few things you need to do. 

### Prerequisites

- MongoDB
- Redis v5.06 or greater
- Node v10.13.0 or greater

Once you have the above installed, you can pass the connection URLs for the two databases through the following environment variables:
- MONGODB_URI for the MongoDB connection string
- REDIS_URL for the Redis connection string

### Installing

After you've cloned the repo and completed the prerequisites, you should run: ```npm install``` in order to download all the various libraries that this project uses. With that complete, you're ready to get up and running. 

## Running the tests

Mocha is the test runner and Chai is the assertion library. To run the tests execute the command:
```npm test```

## Built With

* [Express](https://expressjs.com/) - The web framework
* [Mocha](https://mochajs.org/) - Test runner
* [Chai](https://www.chaijs.com/) - Assertion runner
* [Bull](https://github.com/OptimalBits/bull) - Job queue
* [Mongoose](https://mongoosejs.com/) - MongoDB ORM
and more (see package.json for all details).
## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details