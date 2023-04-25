const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')

const sequelize = require('./util/database');

const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/message');
const passwordRoutes = require("./routes/password");
const groupRoutes = require("./routes/group");

const User = require('./models/user');
const Message = require('./models/message');
const ForgotPasswordRequest = require("./models/forgotpasswords");
const Group = require("./models/group");
const UserGroup = require("./models/usergroup");


const app = express();

//to read passwords from .env file
require('dotenv').config()

app.use(bodyParser.json())
app.use(cors({
    origin : "*"
}))

app.use('/user', userRoutes);
app.use('/chat',chatRoutes);
app.use("/password", passwordRoutes);
app.use('/groups', groupRoutes);

app.use((req,res) => {
    const url = req.url
    res.header('Content-Security-Policy', "img-src 'self'");
    res.sendFile(path.join(__dirname, `public/${url}`))
})


User.hasMany(Message);
Message.belongsTo(User);
User.hasMany(ForgotPasswordRequest);
ForgotPasswordRequest.belongsTo(User);
User.belongsToMany(Group, { through : UserGroup });
Group.belongsToMany(User, {through: UserGroup });
Group.hasMany(Message);
Message.belongsTo(Group);
Group.hasOne(UserGroup)
User.hasOne(UserGroup)


sequelize
.sync()
// .sync({ force : true })
.then(() => {
    app.listen(3000)
})
.catch(err => console.log(err))
