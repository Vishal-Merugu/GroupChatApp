const jwt = require('jsonwebtoken');
const User = require('../models/user');

const dontenv = require("dotenv");
dontenv.config()

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY

const authenticate = async (req, res, next) => {
    try{
        const token = req.headers["authorization"]
        const user = jwt.verify(token, JWT_SECRET_KEY)
        userId = user.id 
        User.findByPk(userId)
        .then((user) => {
            req.user = user;
            next()    
        })
        .catch(err => console.log(err))
        
    }
    catch(err){
        console.log(err);
    }
}

module.exports = {
    authenticate
}