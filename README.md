## AWS Lambda function for running a bot in a Hubs room

Setup:
Configure AWS CLI locally
###### More info on AWS CLI here: https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html

`npm install`

Edit `index.js` and set a password in the password check.

```
  if (password !== "YOUR_PASS_HERE") {
    return callback(null, {
      statusCode: 200,
      body: "bad password"
    });
  }

```

In command line from the repo root directory run `serverless deploy`

Information on configuring your local environment for Serverless can be found here: https://www.serverless.com/framework/docs/providers/aws/guide/deploying/


## Using the Lambda Function

Example Run:
`curl "https://<lambda_endpoint_url>/public/run?host=<hubs_instance_url>&hub_sid=<room_id>&password=<YOUR_PASS>&duration=30"`

There are a number of parameters that you can define in your request. example: `&audio=true`

```
  const {
    hub_sid,
    host,
    duration = 30,
    password,
    lobby,
    audio,
    slow
  } = queryStringParameters;
```

