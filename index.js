const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.PAYMENT_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ err: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ err: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ignmh8y.mongodb.net/?retryWrites=true&w=majority`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const bannerCollection = client.db("summerDB").collection("banner");
    const usersCollection = client.db("summerDB").collection("users");
    const classCollection = client.db("summerDB").collection("class");
    const selectedCollection = client.db("summerDB").collection("selected");
    const paymentHistoryCollection = client.db("summerDB").collection("paymentsHistory");
    const enrolledClassCollection = client.db("summerDB").collection("enrolledClasses");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructors") {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    };

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
      res.send({ token });
    });

    app.get("/banner", async (req, res) => {
      const result = await bannerCollection.find().toArray();
      res.send(result);
    });

    // user api
    app.get("/users", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/instructors", async (req, res) => {
      const query = { role: "instructors" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/topInstructors", async (req, res) => {
      const query = { role: "instructors" };
      const result = await usersCollection
        .find(query)
        .sort({
          totalStudents: -1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/users/role/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ error: 1, message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = {
        admin: user?.role === "admin",
        instructors: user?.role === "instructors",
      };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already has been Create" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateUser);
      res.send(result);
    });

    app.patch("/users/instructors/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          role: "instructors",
        },
      };
      const result = await usersCollection.updateOne(filter, updateUser);
      res.send(result);
    });

    // class api

    app.get("/class/:email", verifyJwt, verifyInstructor, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/topClass", async (req, res) => {
      const query = { status: "approve" };
      const result = await classCollection
        .find(query)
        .sort({
          totalEnrolled: -1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/class", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/allClass", async (req, res) => {
      const query = { status: "approve" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/class", verifyJwt, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.patch("/class/approve/:id", async (req, res) => {
      const id = req.params.id;
      const updatedClass = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          status: updatedClass.status,
        },
      };
      const result = await classCollection.updateOne(filter, updateUser);
      res.send(result);
    });

    app.patch("/class/feedback/:id", async (req, res) => {
      const id = req.params.id;
      const updatedFeedback = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          feedback: updatedFeedback.feedback,
        },
      };
      const result = await classCollection.updateOne(filter, updateUser);
      console.log(result);
      res.send(result);
    });

    // selected api
    app.get("/selected-class/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.findOne(query);
      res.send(result);
    });

    app.get("/selected", verifyJwt, async (req, res) => {
      const decoded = req.decoded;

      if (decoded.email !== req.query.email) {
        return res.status(403).send({ error: 1, message: "forbidden access" });
      }

      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/selected", async (req, res) => {
      const item = req.body;
      const result = await selectedCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/selected/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
    });

    // Get specific student's enrolled classes
    app.get("/enrolled-classes/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;

      const decodedEmail = req.decoded.email;
      if (decodedEmail !== email) {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }

      const query = { studentEmail: email };
      const result = await enrolledClassCollection.find(query).toArray();
      res.send(result);
    });

    // Get specific student's payment history
    app.get("/payments-history/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;

      const decodedEmail = req.decoded.email;
      if (decodedEmail !== email) {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }

      const query = { studentEmail: email };
      const result = await paymentHistoryCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    });

    // Stripe payment intent
    app.post("/create-payment-intent", verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Stripe payments submit
    app.post("/payments", async (req, res) => {
      const { paymentHistory, enrolledClass } = req.body;

      // Added payments history
      const insertPaymentHistory = await paymentHistoryCollection.insertOne(paymentHistory);

      // Added enrolled class
      const insertEnrolledClass = await enrolledClassCollection.insertOne(enrolledClass);

      // Delete class from selected class
      const selectedClassQuery = { classId: enrolledClass.classId };
      const deleteSelectedClass = await selectedCollection.deleteOne(selectedClassQuery);

      // Update class with total enrolled and available seat
      const filterClass = { _id: new ObjectId(enrolledClass.classId) };
      const singleClass = await classCollection.findOne(filterClass);
      const updateDocClass = {
        $set: {
          seats: singleClass.seats - 1,
          totalEnrolled: singleClass.totalEnrolled ? singleClass.totalEnrolled + 1 : 1,
        },
      };

      const updateSeats = await classCollection.updateOne(filterClass, updateDocClass);

      // Update instructor with total student
      const filterInstructor = { email: enrolledClass.instructorEmail };

      const singleInstructor = await usersCollection.findOne(filterInstructor);

      const updateDocInstructor = {
        $set: {
          totalStudents: singleInstructor.totalStudents ? singleInstructor.totalStudents + 1 : 1,
        },
      };

      const updateInstructor = await usersCollection.updateOne(filterInstructor, updateDocInstructor);

      res.send({
        insertPaymentHistory,
        insertEnrolledClass,
        deleteSelectedClass,
        updateSeats,
        updateInstructor,
      });
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

app.get("/", (req, res) => {
  res.send("Summer camp server is running");
});

app.listen(port, () => {
  console.log(`Summer camp Server is running on ${port}`);
});
