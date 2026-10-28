require("dotenv").config();
const mongoose = require("mongoose");
const MensajeIg = require("../dist/models/MensajeIg");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const idStr = "28711549578440592";
  const msgs = await MensajeIg.find({ usuarioIgId: idStr }).sort({ timestamp: 1 });
  console.log(`Encontrados ${msgs.length} mensajes para ${idStr}`);
  if (msgs.length > 0) {
    console.log("Primer mensaje:");
    console.log(JSON.stringify(msgs[0], null, 2));
    
    // Check if ANY message has referralData
    const refMsgs = msgs.filter(m => m.referralData && Object.keys(m.referralData).length > 0);
    console.log(`Mensajes con referralData: ${refMsgs.length}`);
    if (refMsgs.length > 0) {
      console.log(JSON.stringify(refMsgs[0].referralData, null, 2));
    }
  }
  process.exit(0);
}
run();
