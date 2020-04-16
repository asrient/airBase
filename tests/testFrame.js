const crypto=require("crypto");
const frame=require("../frame.js");

var key=crypto.randomBytes(8);
console.log("building frame, fin: false, key: ",key,", data: Hello!");
var frm=frame.build(0,key,Buffer.from("Hello!"));
if(frm!=null){
    console.log("parsing frame...");
    var res=(frame.parse(frm));
    console.log(res)
    console.log(res.data.toString())
}