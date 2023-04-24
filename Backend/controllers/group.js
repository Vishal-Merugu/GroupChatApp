const Group = require('../models/group');
const UserGroup = require('../models/usergroup');
const User = require("../models/user");

exports.postGroup = async (req, res, next) => {
    try{
        const user = req.user;
        const name = req.body.name;
        const members = req.body.members;''
        const newGroup = await user.createGroup({
            name : name
        })
        const groupId = newGroup.id;

        members.forEach(async (member) => {
            const user = await User.findOne({
                where : {
                    email : member
                }
            })
            if(user){
                await UserGroup.create({
                    userId : user.id,
                    groupId : groupId
                })
            }
        });

    }
    catch(err){
        console.log(err);
    }
}

exports.getGroups = async (req, res, next) => {
    try{
        const user = req.user
        // const temp = await UserGroup.findAll({
        //     where : {
        //         userId : user.id
        //     },
        //     include : {
        //         model : Group,
        //         as : "group",
        //         attributes : ["group.name"]
        //     }
        // })
        const groups = await Group.findAll({
            include: [{
              model: UserGroup,
              where: { userId },
              attributes: [],
            }],
            attributes: ['id', 'name'],
          });
        //   console.log(groups);
        res.status(200).json(groups)
    }
    catch(err){
        console.log(err);
    }
}