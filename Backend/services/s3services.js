const AWS = require('aws-sdk');

exports.uploadTos3 = async (data, fileName) => {
    const BUCKET_NAME  = process.env.BUCKET_NAME;
    const IAM_ACCESS_KEY = process.env.IAM_ACCESS_KEY;
    const IAM_SECRET_KEY = process.env.IAM_SECRET_KEY;

    let s3Bucket =  new AWS.S3({
        accessKeyId : IAM_ACCESS_KEY,
        secretAccessKey : IAM_SECRET_KEY
    })

    var params = {
        Bucket : BUCKET_NAME,
        Key : fileName,
        Body : data,
        ACL : "public-read"
    }
    return new Promise(async (resolve,reject) => {
        const s3Response = await s3Bucket.upload(params, (err, s3Response) => {
            if(err){
                console.log(err);
                reject(err)
            }else{
                // console.log(s3Response.Location);
                resolve(s3Response.Location);
            }
        })
    })
}
