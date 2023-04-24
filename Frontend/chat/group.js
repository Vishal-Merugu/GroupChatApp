const url = "http://localhost:3000"

const token = localStorage.getItem('token')
const config = {
    headers : {
        Authorization : token
    }
}

// import {getMessages} from "./chat.js";

const InputGroupName = document.querySelector("#inputgroupname");
const InputMembers = document.querySelector("#inputmembers");


async function getGroups(){
    const response = await axios
    .get(`${url}/groups`,config)
    return response.data
}

function showGroups(groups){
    let groupHTML = ""
    groups.forEach((group, index) => {
        const groupName = group.name;
        const groupId = group.id;
        groupHTML += `
        <tr id = ${groupId}>
            <th>${index + 1}</th>
            <td>${groupName}</td>
        </tr>
        `
    });
    document.querySelector("#groups").innerHTML = groupHTML;

}


document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("#groupform").onsubmit = async (e) => {
        e.preventDefault();
        const groupName = InputGroupName.value;
        const members = InputMembers.value.split(", ");
         const newGroup = {
            name : groupName,
            members : members
         }
        const response = await axios.post(`${url}/groups/group`, newGroup, config)
    } 

    //get Groups the user is in !!
    const groups = await getGroups()

    //to show groups in UI
    showGroups(groups);

    document.querySelector("#groups").onclick = async (e) =>{
        localStorage.setItem("oldmessages", JSON.stringify([]))
        const groupId = e.target.parentNode.id;
        getMessages(groupId)
    }


})