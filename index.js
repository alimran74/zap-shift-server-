const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());



const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@imran.chugnik.mongodb.net/?retryWrites=true&w=majority&appName=Imran`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional)
    // await client.connect();

    const db = client.db("zapShiftDB"); // You can name this anything
    const UserCollection = db.collection("users")
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const trackingCollection = db.collection("trackings");
    const ridersCollection = db.collection("riders");

    // custom middleware
    const verifyFBToken = async(req, res, next) =>{
      const authHeader = req.headers.authorization;
      if(!authHeader){
        return res.status(401).send({message:'unauthorized  access'})
      }
      const token = authHeader.split(' ')[1];
      if(!token){
        return res.status(401).send({message:'unauthorized access'})
      }

      // verify the token 
     try{
       const decoded = await admin.auth().verifyIdToken(token);
       req.decoded = decoded;
       next();
     }
     catch(error){
      return res.status(403).send({message:'forbidden access'})
     }


      
    }



    app.post('/users',async(req, res) =>{
      const email = req.body.email;
      const userExist = await UserCollection.findOne({email})

      if(userExist){
        // update last login info
        return res.send({message:'user already existed'});
      }

      const user = req.body;
      const result = await UserCollection.insertOne(user)
      res.send(result);

    })

    // ✅ POST route to submit rider application
app.post('/riders',  async (req, res) => {
  try {
    const riderData = req.body;

    if (!riderData?.email || !riderData?.bikeRegNumber || !riderData?.nationalId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const result = await ridersCollection.insertOne(riderData);
    res.status(201).json({ success: true, message: "Rider application submitted", insertedId: result.insertedId });

  } catch (error) {
    console.error("❌ Error submitting rider application:", error);
    res.status(500).json({ success: false, message: "Server error while saving rider data" });
  }
});

    // GET all parcels
    app.get("/parcels", async (req, res) => {
      const parcels = await parcelCollection.find().toArray();
      res.send(parcels);
    });

    // GET parcels filtered by email
    app.get("/api/parcels",verifyFBToken, async (req, res) => {
      try {
        const userEmail = req.query.email;
        
        const filter = userEmail ? { userEmail } : {};

        const parcels = await parcelCollection
          .find(filter)
          .sort({ creation_date: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          data: parcels,
        });
      } catch (error) {
        console.error("❌ Error fetching parcels:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    // GET a single parcel by ID
    app.get("/api/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid parcel ID" });
        }

        const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });

        if (!parcel) {
          return res.status(404).json({ success: false, message: "Parcel not found" });
        }

        res.status(200).json({ success: true, data: parcel });
      } catch (error) {
        console.error("❌ Error fetching parcel by ID:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    // POST create new parcel
    app.post("/parcels", async (req, res) => {
      try {
        const newParcel = req.body;

        if (
          !newParcel ||
          !newParcel.parcelId ||
          !newParcel.senderName ||
          !newParcel.receiverName
        ) {
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

    // DELETE a parcel by ID
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Parcel deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "Parcel not found" });
        }
      } catch (error) {
        console.error("❌ Error deleting parcel:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    // PATCH: Mark a parcel as paid
    app.patch("/parcels/:id/mark-paid", async (req, res) => {
      try {
        const parcelId = req.params.id;
        if (!ObjectId.isValid(parcelId)) {
          return res.status(400).json({ success: false, message: "Invalid parcel ID" });
        }

        const result = await parcelCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          { $set: { isPaid: true, status: "Paid" } } // optional to update status also
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ success: false, message: "Parcel not found or already paid" });
        }

        res.json({ success: true, message: "Parcel marked as paid" });
      } catch (error) {
        console.error("❌ Error updating parcel payment status:", error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // GET payment history by user (filter by email)
    app.get("/payments", verifyFBToken, async (req, res) => {
     
      try {
        const email = req.query.email;
        if(req.decoded.email !== email){
          return res.status(403).send({message: 'forbidden access'})
        }
        const filter = email ? { userEmail: email } : {};

        const history = await paymentCollection
          .find(filter)
          .sort({ paidAt: -1 }) // newest first
          .toArray();

        res.status(200).json({ success: true, data: history });
      } catch (error) {
        console.error("❌ Error in GET /payments:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    // POST payment record + update parcel isPaid
    app.post("/payments", async (req, res) => {
      try {
        const paymentData = req.body;
        const { parcelId, amount, userEmail, transactionId } = paymentData;

        if (!parcelId || !amount || !userEmail) {
          return res.status(400).json({ success: false, message: "Missing fields" });
        }

        // Update parcel to isPaid: true
        await parcelCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          { $set: { isPaid: true } }
        );

        // Save payment history
        const paymentEntry = {
          parcelId,
          userEmail,
          amount,
          transactionId: transactionId || `txn_${Date.now()}`,
          paid_at_string: new Date().toISOString(),
          paidAt: new Date(), // for sorting
        };

        await paymentCollection.insertOne(paymentEntry);

        res.status(200).json({ success: true, message: "Payment recorded" });
      } catch (error) {
        console.error("❌ Error in /payments:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    // Create payment intent for Stripe
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount } = req.body;

        if (!amount || isNaN(amount)) {
          return res.status(400).json({ success: false, message: "Invalid amount" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // Stripe expects amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.status(200).send({
          success: true,
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("❌ Error creating payment intent:", error);
        res.status(500).send({
          success: false,
          message: "Failed to create payment intent",
        });
      }
    });

    // post api for tracking 

    app.post("/trackings", async (req, res) => {
  try {
    const { parcelId, status, location, timestamp, note } = req.body;

    if (!parcelId || !status || !location || !timestamp) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const trackingUpdate = { parcelId, status, location, timestamp, note };
    const result = await trackingCollection.insertOne(trackingUpdate);

    res.status(201).json({ success: true, message: "Tracking update added", insertedId: result.insertedId });
  } catch (err) {
    console.error("❌ Error adding tracking update:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


    // Ping to confirm connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// Sample root route
app.get("/", (req, res) => {
  res.send(" 🚚zapShift server is running");
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
