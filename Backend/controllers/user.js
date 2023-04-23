const User = require('../models/user');

const { v4 : uuuidv4} = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
saltRounds = 10;

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY

exports.postSignUp = async (req, res, next) => {
    try{
        const { name, email, phone, password } = req.body
        const users = await User.findAll({ where : {
            email : email
        }})
        const user = users[0]
        if(user){
            res.status(404).json({ message : "User Already Exists!!"})
        }
        else{
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                const user = await User.create({
                    id : uuuidv4(),
                    name : name,
                    email : email,
                    phone : phone,
                    password : hash
                })
                res.status(200).json({ success : true })
            })
        }
    }
    catch(err){
        console.log(err)
    }
}

function generateAccessToken(id, name){
    return  jwt.sign({ id : id, name : name }, JWT_SECRET_KEY )
}

exports.postLogin = async (req, res, next) => {
    try{
        const { email, password } = req.body
        const user = await User.findOne({ where : { email : email }})
        if(!user){
            res.status(400).json({ message : "User Not Found !!" })
        }
        else{
            bcrypt.compare(password, user.password, (err, result) => {
                if(result){
                    const token = generateAccessToken(user.id,user.name )
                    res.status(200).json({ message : "user found", token : token, id : user.id })
                }
                else{
                    res.status(401).json({ message : "Incorrect Password !!" })
                }
            })
        }
    }
    catch(err){
        console.log(err);
    }
}
