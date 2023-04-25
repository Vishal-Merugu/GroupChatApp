const url = "http://localhost:3000"

const token = localStorage.getItem('token')
const config = {
    headers : {
        Authorization : token
    }
}

const InputGroupName = document.querySelector("#inputgroupname");
const InputMembers = document.querySelector("#inputmembers");
const InputAdmins = document.querySelector("#inputadmins");
const IsEdit = document.querySelector("#isedit")


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
        adminPerks = ''
        if(group.usergroup.isadmin){
            adminPerks = `
            <td>
              <div class="btn-group">
                  <button class="btn btn-sm btn-primary" id = "editgroup">edit</button>
                  <button class="btn btn-sm btn-danger" id = "deletegroup">X</button>
              </div>
            </td>
            `
        }
        groupHTML += `
        <tr id = ${groupId}>
            <th>${index + 1}</th>
            <td>${groupName}</td>
            ${adminPerks}
        </tr>
        `
    });
    document.querySelector("#groups").innerHTML = groupHTML;

}

async function deleteGroup(groupId){
    const response = await axios.delete(`${url}/groups/${groupId}`,config)

    if(response.status == 200){
        const groups = await getGroups()
        showGroups(groups)
    }
}

async function createGroup(newGroup){
    const response = await axios.post(`${url}/groups/group`, newGroup, config)
        if(response.status == 200){
            const groups = await getGroups()
            showGroups(groups)

            InputGroupName.value = ""
            InputMembers.value = ""
            InputAdmins.value = ""
        }
}

async function getGroup(groupId){
    const response = await axios.get(`${url}/groups/${groupId}`, config
    );
    const group = response.data;

    const groupName = group.name ;

    let members = "";
    let admins = "";
    group.users.forEach(user => {
        members +=  user.email + ", "
        if (user.isAdmin){
            admins += user.email + ", "
        }
    })
    InputGroupName.value = groupName;
    InputMembers.value = members;
    InputAdmins.value = admins;
    IsEdit.value = groupId

}

async function editGroup (newGroup, groupId){
    const response = await axios.put(`${url}/groups/${groupId}`, newGroup, config)
    InputGroupName.value = '';
    InputMembers.value = '';
    InputAdmins.value = '';
    IsEdit.value = '';
}

document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("#groupform").onsubmit = async (e) => {
        e.preventDefault();
        const groupName = InputGroupName.value;
        const members = InputMembers.value.split(", ");
        const admins = InputAdmins.value.split(", ");
        const newGroup = {
            name : groupName,
            members : members,
            admins : admins
         }
         if(IsEdit.value != ""){
            const groupId = IsEdit.value
            editGroup(newGroup, groupId)
         }
         else{
             createGroup(newGroup)
         }
    } 

    //get Groups the user is in !!
    const groups = await getGroups()

    //to show groups in UI
    showGroups(groups);

    document.querySelector("#groups").onclick = async (e) =>{

        isDelete = e.target.id == "deletegroup" ? true : false ;
        isEdit = e.target.id == "editgroup" ? true : false ;
        
        if( !isDelete && !isEdit ){
            const groupId = e.target.parentNode.id;
            localStorage.setItem("oldmessages", JSON.stringify([]))
            getMessages(groupId)
        }
        else if (isDelete){
            const groupId = e.target.parentNode.parentNode.parentNode.id
            deleteGroup(groupId)
        }
        else if (isEdit){
            const groupId = e.target.parentNode.parentNode.parentNode.id
            await getGroup(groupId)
        }
    }


})