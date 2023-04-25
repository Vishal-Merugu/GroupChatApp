const User = require("../models/user");
const ForgotPasswordRequest = require("../models/forgotpasswords");

const Sib = require("sib-api-v3-sdk");
const { v4: uuidv4 } = require('uuid');

const bcrypt = require("bcrypt");
const saltRounds = 10;

require("dotenv").config();

const sequelize = require("../util/database");

exports.postForgotPassword = async(req, res, next) => {
    try{

        const client =  Sib.ApiClient.instance;

        const apiKey =   client.authentications['api-key'];

        apiKey.apiKey =  process.env.SIB_API_KEY

        const tranEmailApi = new Sib.TransactionalEmailsApi();
        
        const email = req.body.email;
        const uuid = await uuidv4()
        const user = await User.findOne({ where : { email : email }})
        if(!user){
            res.status(400).json({success : false,  message : "User Not Found !!"})
            return
        }

        const createuser = ForgotPasswordRequest.create({
            id : uuid,
            userId : user.id
        })

        const sender = {
            email : "buntymerugu0@gamil.com",
            name : "Expense Tracker"
        }

        const recievers = [{
                email : `${email}`
            }]
        const sendMail =  tranEmailApi.sendTransacEmail({
            sender,
            to : recievers,
            subject : "Reset Your Password",
            htmlContent : `<html><p>Click <a href = "http://44.201.228.229:3000/password/resetpassword/{{params.uuid}}">  here </a> to reset to password</p></html>`,
            params : {
                uuid : uuid
            }
        })

        Promise.all([createuser, sendMail])
        res.status(200).json({ success : true, message : "you chose to reset your password" })

    }
    catch(err){
        console.log(err);
    }
}

exports.getResetPassword = async (req,res,next) => {
    try{
        const id  = req.params.uuid;
        const forgotPasswordRequest = await ForgotPasswordRequest.findOne({ where : { id : id }})
        const isActive = forgotPasswordRequest.isActive;
        if(isActive){
            res.set("id",id)
            res.status(200).send(`
            <!DOCTYPE html>
            <html lang="en" >
            <head>
    
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Forgot password</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet">
    
            <style>
                *{
                margin: 0%;
                padding:0;
                box-sizing: border-box;
                }
    
                body{
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
    
                .login{
                    width : 360px;
                    background-color: white;
                    height: min-content;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 12px 10px #c9dbd4 ;
                }
    
                .login h1{
                    font-size: 36px;
                    margin-bottom: 25px;
                }
    
                .login form{
                    font-size: 16px;
                }
    
                .login form .form-group{
                    margin-bottom: 12px;
                }
    
                #submit{
                    font-size: 17px;
                    margin-top: 15px;
                    background-color: #D7E1DD;
                }
    
                #submit:hover, #submit:active{
                    background-color: #B0B9B6;
                }
    
            </style>
    
    
        </head>
        <body style="background-color:#E8F5F0;"> 
            <div class="login">
                <h3 class = "text-center mb-3 mt-1">Create New Password</h3>
                <form action="/password/resetpassword/${id}" class = "needs-validation" method=POST
                oninput='up2.setCustomValidity(up2.value != up.value ? "Passwords do not match." : "")'>
                <div class="form-group was-validated">
                    <label class = "form-label" for="password1">Password:</label>
                    <input class = "form-control"  id="password1" type=password required name=up>
                    <div class="invalid-feedback">
                        Please enter your new password
                    </div>
                </div>
                <div class="form-group was-validated">
                    <label for="password2" class = "form-label">Confirm password:
                    </label>
                    <input id="password2" class = "form-control" type=password name=up2 required>
                </div>
                <input class = "btn w-100" id = "submit" type="submit" value = "Reset Password">
                </form>
            </div>
    
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js"></script>
    
            <script>
            const myHeaders = new Headers(); // Currently empty
            const temp = myHeaders.get("id"); // Returns null
            console.log(temp);
            </script>
            
        </body>
        </html>
            `)
        res.end()
        }else{
            res.status('400').send("<h1>Link Expired</h1>")
        }
    }
    catch(err){
        console.log(err);
    }
}

exports.postUpdatePassword = async (req,res,next) => {
    const t = await sequelize.transaction()
    try{
        const id = req.params.uuid;
        const newPassword = req.body.up

        bcrypt.hash(newPassword,saltRounds, async(err,hash)=>{
            try{
                const forgotPasswordRequest = await ForgotPasswordRequest.findOne({ where : { id : id }})
                await forgotPasswordRequest.update({
                    isActive : false
                },{ transaction : t })
    
                const userId = forgotPasswordRequest.userId
                User.update({
                    password : hash
                },
                {
                    where :{
                    id : userId
                    }
                },{ transaction : t })
                await t.commit()
                res.status(200).send("<h1>Password Changed Successfully</h1>")
            }catch(err){
                await t.rollback()
                res.status(400).send("<h1>Error Occured try someother time</h1>")
                console.log(err);
            }
        })
    
    }
    catch(err){
        await t.rollback()
        res.status(400).send("<h1>Error Occured try someother time</h1>")
        console.log(err);
    }
    

}