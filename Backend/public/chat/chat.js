const Message = document.querySelector('#message');
const f = document.querySelector("#file");
const FileUploadPercentage = document.querySelector("#percentage")

if(!token){
    document.querySelector('body').innerHTML = "<h1 class = 'text-center'>Login First<h1>"
}

async function showMessages(messages){
    
    let chat = [] ;
    messages.forEach(message => {

        if(message.user.id == localStorage.getItem('id')){
            name = ""
            msgclass = 'float-end'
            msgcolor = "mymsgcolor"  
        }
        else{
            name = message.user.name + ":"
            msgclass = ""
            msgcolor = "othermsgcolor"
        } 

        chat += `
        <div class="mb-2 ${msgcolor}">
            <div class = "container ms-0 ps-0">
            <div class="row">
                <div class="col mt-1 mb-1">
                    <span id = "sendername" class = "${msgclass} ps-1 pe-1 text-center">${name}</span>
                    <span class = "${msgclass} p-2" autofocus>${message.message}</span>
                </div>
            </div>
            </div>
        </div>
        `
    });

    document.querySelector("#chat").innerHTML = chat
}


let msgInterval;
function getMessages (groupId){

    localStorage.setItem("groupid",groupId)
    
    if(msgInterval){
        clearInterval(msgInterval)
    }

    msgInterval =  setInterval(async () => {

        let oldMessages = localStorage.getItem("oldmessages");
        if(oldMessages != undefined || JSON.parse(oldMessages).length == 0 ){
            lastMessageId = -1;
        }
        else{
            
            oldMessages = JSON.parse(localStorage.getItem("oldmessages"))
            lastMessageId = +oldMessages[oldMessages.length - 1].id
            // console.log(lastMessageId);
        }

        const newMessages = await axios.get(`${url}/chat/messages?lastmessageid=${lastMessageId}&groupid=${groupId}`,config)

        if(lastMessageId == -1){
            const oldMessages = JSON.stringify(newMessages.data.slice(-15));
            localStorage.setItem("oldmessages", oldMessages)
        }
        else if(newMessages.data.length > 0) {

            const oldMessages = JSON.parse(localStorage.getItem("oldmessages"))

            const concatMessages = oldMessages.concat(newMessages.data);

            let slicedMessages ;
            if(concatMessages.length > 15){
                slicedMessages = concatMessages.slice(-15);
            }

            localStorage.setItem("oldmessages",JSON.stringify(slicedMessages))
            
        }

        messagesToShow = JSON.parse(localStorage.getItem("oldmessages"))

        showMessages(messagesToShow);
    },1000)

}

document.addEventListener("DOMContentLoaded",async () => {
    document.querySelector("#messageform").onsubmit = async (e) => {
        e.preventDefault();
        
        const message = Message.value ;
        const fName = f.value;

        if(message){
            const groupId = localStorage.getItem('groupid')
            await axios.post(`${url}/chat/message?groupid=${groupId}`, { message : message }, config)
            Message.value = ""
        }

        if(fName){

            const fileReader = new FileReader();
            const theFile = f.files[0];
            fileReader.onload = async ev => {

                const CHUNK_SIZE = 500;
                const chunkCount = ev.target.result.byteLength/CHUNK_SIZE

                console.log('Read successfullt');
                const fileName = theFile.name ;
                for (let chunkId = 0;chunkId < chunkCount + 1 ; chunkId ++ ){
                    const chunk = ev.target.result.slice(chunkId * CHUNK_SIZE, chunkId * CHUNK_SIZE + CHUNK_SIZE );
                    await axios.post(`${url}/chat/file`, chunk, {
                        headers : {
                            "Content-Type" : "application/octet-stream",
                            "content-length" : chunk.length,
                            "file-name" : fileName,
                            ...config.headers,
                            "group-id" : localStorage.getItem('groupid'),
                            "user-id" : localStorage.getItem('id')
                        } 
                    })
                    FileUploadPercentage.textContent =`${ Math.round(chunkId * 100 /chunkCount, 0)}% `
                }
            }
            fileReader.readAsArrayBuffer(theFile)
            fName.value = ""
            
        
        }
    }





    document.querySelector("#logout").onclick = () => {
        localStorage.removeItem('id');
        localStorage.removeItem("token")
        window.location.href = "../login/login.html"
    }
})

