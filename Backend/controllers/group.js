const Group = require('../models/group');
const UserGroup = require('../models/usergroup');
const User = require("../models/user");

exports.postGroup = async (req, res, next) => {
    try{
        const user = req.user;
        const name = req.body.name;
        const members = req.body.members;
        const admins = req.body.admins;
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
                if(admins.indexOf(user.email) == -1){
                    isadmin = false
                }else{
                    isadmin = true
                }
                await UserGroup.create({
                    userId : user.id,
                    groupId : groupId,
                    isadmin : isadmin
                })
            }
        });
        res.status(200).json({ success : true })

    }
    catch(err){
        console.log(err);
    }
}

exports.getGroups = async (req, res, next) => {
    try{
        const user = req.user
        const groups = await Group.findAll({
            include: [{
              model: UserGroup,
              where: { userId : user.id },
              attributes: ['isadmin'],
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

exports.deleteGroup = async (req, res, next) => {
    try{
        const user = req.user;
        const groupId = req.params.groupId;
        const group = await Group.findByPk(groupId)
        await group.destroy()
        
        res.status(200).json({ success : true })
    }
    catch(err){
        console.log(err);
    }
}

exports.getGroup = async (req, res, next) => {
    try{
        const groupId = req.params.groupId;
    
        const groupName = await Group.findByPk(groupId)
        const users = await UserGroup.findAll({
            where : {
                groupId : groupId
            },
            attributes : ['userId', 'isAdmin']
        })
        const group = {
            name : groupName.name,
        }
        var groupUsers = []
        for (let i = 0 ; i < users.length ; i++){
            const response = await User.findOne({
                where : {
                    id : users[i].userId
                },
                attributes : ['email']
            })
            const temp = {
                ...users[i].dataValues,
                email : response.email
            }
            groupUsers.push(temp)
        }

        group.users = groupUsers
        res.status(200).json(group)
    }
    catch(err){
        console.log(err);
    }

}

exports.editGroup = async (req, res, next) => {
    try{
        
        const group = req.body
        const groupName = group.name;
        const members = group.members;
        const admins = group.admins
        const groupId = req.params.groupId

        // const newMembers = []

        // members.forEach(async(member, index) => {
        //     const response = await User.findOne({
        //         where : {
        //             email : member
        //         },
        //         attributes : ['id']
        //     })
        //     console.log(response.dataValues.id);
        //     newMembers.push(response.dataValues.id)
        // })

        // console.log(newMembers);
        await Group.update(
            {name : groupName},{
                where : {
                    id : groupId
                }
            }
        )
        const oldGroup = await User.findAll({
            attributes : ['id','email'],
            include : {
                model : UserGroup,
                where : {
                    groupId : groupId
                },
                attributes : ['isadmin']
            }
        })
        const oldMembers = []
        oldGroup.forEach(async (member, index) => {
            const email = member.dataValues.email;
            const id = member.dataValues.id;
            const isAdmin = member.dataValues.usergroup.isadmin
            oldMembers.push(id)
            if(members.indexOf(email) == -1){
                const groupMember = await UserGroup.findOne({
                    where : {
                        groupId : groupId,
                        userId : id
                    }
                })
                await groupMember.destroy()
            }
        })

        // console.log(oldMembers);
        res.status(200).json(oldGroup)
    }
    catch(err){
        console.log(err);
    }
}