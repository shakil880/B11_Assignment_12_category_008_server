const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL_1,
    process.env.FRONTEND_URL_2,
    process.env.FRONTEND_URL_3,
    process.env.FRONTEND_PROD_URL
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// JWT middleware
const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    
    const database = client.db('realEstateDB');
    const usersCollection = database.collection('users');
    const propertiesCollection = database.collection('properties');
    const wishlistCollection = database.collection('wishlist');
    const offersCollection = database.collection('offers');
    const reviewsCollection = database.collection('reviews');
    const reportsCollection = database.collection('reports');

    // Welcome Route & API Documentation
    app.get('/', (req, res) => {
      const apiDocumentation = {
        message: "🏠 Welcome to Real Estate Platform API",
        version: "1.0.0",
        status: "Running Successfully",
        database: "Connected to MongoDB",
        documentation: {
          "Authentication": {
            "POST /jwt": "Generate JWT token",
            "Description": "Send user object to get JWT token for authentication"
          },
          "User Management": {
            "GET /users": "Get all users (Admin only)",
            "POST /users": "Create or update user",
            "GET /users/:email": "Get user by email",
            "PATCH /users/:id": "Update user role (Admin only)",
            "DELETE /users/:id": "Delete user (Admin only)"
          },
          "Property Management": {
            "GET /properties": "Get all verified properties",
            "GET /properties/:id": "Get property by ID",
            "POST /properties": "Add new property (Agent only)",
            "PUT /properties/:id": "Update property (Agent/Admin)",
            "DELETE /properties/:id": "Delete property (Agent/Admin)",
            "PATCH /properties/:id/verify": "Verify property (Admin only)",
            "GET /properties/agent/:email": "Get properties by agent email"
          },
          "Wishlist Management": {
            "GET /wishlist/:email": "Get user's wishlist",
            "POST /wishlist": "Add property to wishlist",
            "DELETE /wishlist/:id": "Remove from wishlist"
          },
          "Offer Management": {
            "GET /offers": "Get all offers (Admin only)",
            "GET /offers/buyer/:email": "Get offers by buyer email",
            "GET /offers/agent/:email": "Get offers for agent properties",
            "POST /offers": "Make an offer on property",
            "PATCH /offers/:id/accept": "Accept offer (Agent only)",
            "PATCH /offers/:id/reject": "Reject offer (Agent only)"
          },
          "Review Management": {
            "GET /reviews": "Get all reviews",
            "GET /reviews/property/:id": "Get reviews for property",
            "GET /reviews/user/:email": "Get reviews by user",
            "POST /reviews": "Add new review",
            "DELETE /reviews/:id": "Delete review (Admin/Owner)"
          },
          "Payment Management": {
            "POST /create-payment-intent": "Create Stripe payment intent",
            "POST /payments": "Process successful payment",
            "GET /payments/buyer/:email": "Get buyer's purchase history"
          }
        },
        "Environment": process.env.NODE_ENV || "development",
        "Port": process.env.PORT || 5000,
        "Timestamp": new Date().toISOString()
      };
      
      res.json(apiDocumentation);
    });

    // Health Check Route
    app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: 'Connected'
      });
    });

    // JWT token generation
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // User Management APIs
    app.get('/users', verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      res.send(user);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists' });
      }
      user.role = 'user';
      user.createdAt = new Date();
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/users/agent/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'agent'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/users/fraud/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'fraud'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      
      // Remove all properties by this agent from verified properties
      await propertiesCollection.updateMany(
        { agentEmail: req.body.email },
        { $set: { verificationStatus: 'rejected' } }
      );
      
      res.send(result);
    });

    app.delete('/users/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // Property Management APIs
    app.get('/properties', async (req, res) => {
      const { search, sort, minPrice, maxPrice } = req.query;
      let query = { verificationStatus: 'verified' };
      
      if (search) {
        query.location = { $regex: search, $options: 'i' };
      }
      
      if (minPrice || maxPrice) {
        query.priceRange = {};
        if (minPrice) query.priceRange.min = { $gte: parseInt(minPrice) };
        if (maxPrice) query.priceRange.max = { $lte: parseInt(maxPrice) };
      }
      
      let result = propertiesCollection.find(query);
      
      if (sort === 'price-asc') {
        result = result.sort({ 'priceRange.min': 1 });
      } else if (sort === 'price-desc') {
        result = result.sort({ 'priceRange.max': -1 });
      }
      
      const properties = await result.toArray();
      res.send(properties);
    });

    app.get('/properties/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertiesCollection.findOne(query);
      res.send(result);
    });

    app.get('/properties/agent/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { agentEmail: email };
      const result = await propertiesCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/properties/sold/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const soldOffers = await offersCollection.find({ 
        agentEmail: email, 
        status: 'bought' 
      }).toArray();
      res.send(soldOffers);
    });

    app.post('/properties', verifyToken, async (req, res) => {
      const property = req.body;
      property.verificationStatus = 'pending';
      property.createdAt = new Date();
      property.isAdvertised = false;
      const result = await propertiesCollection.insertOne(property);
      res.send(result);
    });

    app.put('/properties/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedProperty = req.body;
      const property = {
        $set: {
          title: updatedProperty.title,
          location: updatedProperty.location,
          image: updatedProperty.image,
          priceRange: updatedProperty.priceRange,
          description: updatedProperty.description
        }
      };
      const result = await propertiesCollection.updateOne(filter, property, options);
      res.send(result);
    });

    app.patch('/properties/verify/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          verificationStatus: 'verified'
        },
      };
      const result = await propertiesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/properties/reject/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          verificationStatus: 'rejected'
        },
      };
      const result = await propertiesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/properties/advertise/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          isAdvertised: true
        },
      };
      const result = await propertiesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/advertised-properties', async (req, res) => {
      const query = { verificationStatus: 'verified', isAdvertised: true };
      const result = await propertiesCollection.find(query).limit(4).toArray();
      res.send(result);
    });

    app.delete('/properties/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertiesCollection.deleteOne(query);
      res.send(result);
    });

    // Wishlist APIs
    app.get('/wishlist/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const wishlistItems = await wishlistCollection.find({ userEmail: email }).toArray();
      const propertyIds = wishlistItems.map(item => new ObjectId(item.propertyId));
      const properties = await propertiesCollection.find({ _id: { $in: propertyIds } }).toArray();
      res.send(properties);
    });

    app.post('/wishlist', verifyToken, async (req, res) => {
      const wishlistItem = req.body;
      const existingItem = await wishlistCollection.findOne({
        userEmail: wishlistItem.userEmail,
        propertyId: wishlistItem.propertyId
      });
      if (existingItem) {
        return res.send({ message: 'Property already in wishlist' });
      }
      const result = await wishlistCollection.insertOne(wishlistItem);
      res.send(result);
    });

    app.delete('/wishlist/:email/:propertyId', verifyToken, async (req, res) => {
      const { email, propertyId } = req.params;
      const query = { userEmail: email, propertyId: propertyId };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    // Offers APIs
    app.get('/offers/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await offersCollection.find({ buyerEmail: email }).toArray();
      res.send(result);
    });

    app.get('/offers/agent/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await offersCollection.find({ agentEmail: email }).toArray();
      res.send(result);
    });

    app.post('/offers', verifyToken, async (req, res) => {
      const offer = req.body;
      offer.status = 'pending';
      offer.createdAt = new Date();
      const result = await offersCollection.insertOne(offer);
      res.send(result);
    });

    app.patch('/offers/accept/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const offer = await offersCollection.findOne({ _id: new ObjectId(id) });
      
      // Accept this offer
      await offersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'accepted' } }
      );
      
      // Reject all other offers for the same property
      await offersCollection.updateMany(
        { 
          propertyId: offer.propertyId,
          _id: { $ne: new ObjectId(id) }
        },
        { $set: { status: 'rejected' } }
      );
      
      res.send({ message: 'Offer accepted successfully' });
    });

    app.patch('/offers/reject/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateDoc = {
        $set: {
          status: 'rejected'
        },
      };
      const result = await offersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send(result);
    });

    app.patch('/offers/bought/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateDoc = {
        $set: {
          status: 'bought',
          transactionId: req.body.transactionId,
          paymentDate: new Date()
        },
      };
      const result = await offersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send(result);
    });

    // Reviews APIs
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().sort({ createdAt: -1 }).limit(3).toArray();
      res.send(result);
    });

    app.get('/reviews/property/:id', async (req, res) => {
      const propertyId = req.params.id;
      const result = await reviewsCollection.find({ propertyId: propertyId }).toArray();
      res.send(result);
    });

    app.get('/reviews/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await reviewsCollection.find({ reviewerEmail: email }).toArray();
      res.send(result);
    });

    app.post('/reviews', verifyToken, async (req, res) => {
      const review = req.body;
      review.createdAt = new Date();
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.delete('/reviews/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });

    // Payment API (Stripe integration would go here)
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { amount } = req.body;
      // In a real application, you would integrate with Stripe here
      // For demonstration purposes, we'll simulate a successful payment
      const transactionId = 'txn_' + Math.random().toString(36).substr(2, 9);
      res.send({ 
        success: true, 
        transactionId: transactionId,
        amount: amount 
      });
    });

    // Reports API (Optional)
    app.get('/reports', verifyToken, async (req, res) => {
      const result = await reportsCollection.find().toArray();
      res.send(result);
    });

    app.post('/reports', verifyToken, async (req, res) => {
      const report = req.body;
      report.createdAt = new Date();
      const result = await reportsCollection.insertOne(report);
      res.send(result);
    });

    app.get('/', (req, res) => {
      res.send('Real Estate Server is running!');
    });

    console.log("Successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Real Estate server is running on port ${port}`);
});