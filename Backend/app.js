const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')

const sequelize = require('./util/database');

const userRoutes = require('./routes/user');

const app = express();

//to read passwords from .env file
require('dotenv').config()

app.use(bodyParser.json())
app.use(cors({
    origin : "*"
}))

app.use('/user', userRoutes)

sequelize
.sync()
// .sync({ force : true })
.then(() => {
    app.listen(3000)
})
.catch(err => console.log(err))
