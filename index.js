const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xu3sd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//* decoding token and sending to (/booking) endpoint  logic by next()
function verifyJWT(req, res, next) {
  //* reading header
  const authHeader = req.headers.authorization;
  //* auth header na thakle,atkay dibe. meaning, email diye localhost:5000/booking/patient=abc@cd.com e query krle ekhn ar email specific information pabe na
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  //* authheader er outout : bearer egsdas.....1as
  //* authheader.split(" ") output: ["bearer","egsd.....1as"]
  //* authheader.split(" ")[1] output: egsd.....1as
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    console.log(decoded);
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctor-portal").collection("service");
    const bookingCollection = client.db("doctor-portal").collection("booking");
    // * user realated collection
    const userCollection = client.db("doctor-portal").collection("user");

    //* get all users
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    //* admin checker
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin"; //  output: true or, false
      res.send({ admin: isAdmin });
    });
    //* make admin, assign role admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      //* client er fetch url er email
      const email = req.params.email;
      //* client er token er email
      const requester = req.decoded.email;
      //* client er token er email niye tar account info
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      //* shudhu admin i onno user ke admin banate parbe
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      //* for update (filter, updatedoc, option)
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      //*-----------JWT---------------------
      //* issue token: jwt.sign(payload,secret,optional)
      const token = jwt.sign(
        //? payload (ki data pathate chacci ta)
        { email: email },
        //? secret key from .env
        process.env.ACCESS_TOKEN_SECRET,
        //? optional
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    // Warning: This is not the proper way to query multiple collection.
    // After learning more about mongodb. use aggregate, lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1:  get all services
      const services = await serviceCollection.find().toArray();

      // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach((service) => {
        // step 4: find bookings for that service. output: [{}, {}, {}, {}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service Bookings: ['', '', '', '']
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //step 7: set available to slots to make it easier
        service.slots = available;
      });

      res.send(services);
    });

    /**
     * API Naming Convention
     * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
     * app.get('/booking/:id') // get a specific booking
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id) //
     * app.delete('/booking/:id) //
     */
    // * verifyJWT ekahne middle-tier hiseb e kaj korce
    app.get("/booking", verifyJWT, async (req, res) => {
      // const query = {};
      // const cursor = bookingCollection.find(query);
      // const result = await cursor.toArray();
      // res.send(result);

      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      //* valid token dhari jate onno email er info access krte na pare se jnno decode kra email ar valid token dharir email check
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
      // const authorization = req.headers.authorization;
      // console.log(authorization);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From Doctor Uncle!");
});

app.listen(port, () => {
  console.log(`Doctors App listening on port ${port}`);
});

// const express = require("express");
// const { MongoClient, ServerApiVersion } = require("mongodb");
// const cors = require("cors");
// require("dotenv").config();
// const app = express();
// const port = process.env.PORT || 5000;
// //* middleware
// app.use(cors());
// app.use(express.json());

// //* mongodb
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xu3sd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

// const client = new MongoClient(uri, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
//   serverApi: ServerApiVersion.v1,
// });

// async function run() {
//   try {
//     await client.connect();
//     //* db connection check
//     // console.log('db connected')
//     const serviceCollection = client.db("doctor-portal").collection("service");
//     const bookingCollection = client.db("doctor-portal").collection("booking");

//     //* api for get all data
//     app.get("/service", async (req, res) => {
//       const query = {};
//       const cursor = serviceCollection.find(query);
//       const services = await cursor.toArray();
//       res.send(services);

//       /**
//        **============ API Naming convention ==================

//        ** app.get('/booking') // get all booking in this collection. or get more than one or by filter

//        ** app.get("/booking/:id") // get a specific booking

//        ** app.post('/booking') // add a new booking

//        ** app.patch('/booking/:id') // specefic item update

//        ** app.delete('/booking/:id') // specefic item delete
//        */
//     });
//     app.get("/available", async (req, res) => {
//       const date = req.query.date;
//       console.log(date);
//       //* step 1: get all services
//       const services = await serviceCollection.find().toArray();
//       // res.send(services);
//       //* step 2: get the booking of that day. output: [{},{},{},{},...]
//       const query = { date: date };
//       const bookings = await bookingCollection.find(query).toArray();

//       // res.send(bookings);

//       //* step 3: for each service,
//       services.forEach((service) => {
//         //* step 4: find bookings for that service. output: [{},{},{}]
//         const serviceBookings = bookings.filter(
//           //? booking item er sathe jdi service er item er name mile jay tahole oi booking ta oi service er ontorvukto
//           (book) => book.treatment === service.name
//         );
//         //* step 5: ukto service er jotogulo bookings ase , segulor slot gulo ke select krba : ["", "", "", ""]
//         const bookedSlots = serviceBookings.map((book) => book.slot);
//         //* step 6: booked er moddhe je slot gulo nai segulo service theke select koro
//         const available = service.slots.filter(
//           (slot) => !bookedSlots.includes(slot)
//         );
//         //* step 7: set available to slots to make it easier
//         service.slots = available;
//       });

//       res.send(services);
//     });
//     app.post("/booking", async (req, res) => {
//       // * client theke data pawa
//       const booking = req.body;
//       //* eki patient same booking jate na dite pare, shei jnno age theke check kora oi patient er age theke booking kra ase naki
//       const query = {
//         treatment: booking.treatment,
//         date: booking.date,
//         patient: booking.patient,
//       };
//       const exists = await bookingCollection.findOne(query);
//       if (exists) {
//         return res.send({ success: false, booking: exists });
//       }
//       //* shei data insert kra db te
//       const result = await bookingCollection.insertOne(booking);
//       return res.send({ success: true, result });
//     });
//   } finally {
//   }
// }
// run().catch(console.dir);

// app.get("/", (req, res) => {
//   res.send("running server");
// });
// app.listen(port, () => {
//   console.log("listening to port", port);
// });
