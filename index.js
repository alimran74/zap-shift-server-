const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');
require("dotenv").config();



const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@imran.chugnik.mongodb.net/?retryWrites=true&w=majority&appName=Imran`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

        const db = client.db("zapShiftDB"); // You can name this anything
    const parcelCollection = db.collection("parcels");




    // get api for all collection
     app.get("/parcels", async (req, res) => {
      const parcels = await parcelsCollection.find().toArray();
      res.send(parcels);
    });




// POST API to create a new parcel
app.post("/parcels", async (req, res) => {
  try {
    const newParcel = req.body;

    if (!newParcel || !newParcel.parcelId || !newParcel.senderName || !newParcel.receiverName) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const result = await parcelCollection.insertOne(newParcel);
    res.status(201).json({
      success: true,
      message: "Parcel created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating parcel:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }

}
run().catch(console.dir);







// sample route
app.get('/',(req,res) =>{
    res.send(' 🚚zapShift server is running')
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
