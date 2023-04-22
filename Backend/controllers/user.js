const User = require('../models/user');

const bcrypt = require('bcrypt');
saltRounds = 10;

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
