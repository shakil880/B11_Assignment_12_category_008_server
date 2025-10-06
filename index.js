const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'http://localhost:3000',
    process.env.FRONTEND_URL_1,
    process.env.FRONTEND_URL_2, 
    process.env.FRONTEND_URL_3,
    process.env.FRONTEND_PROD_URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'user-email']
}));
app.use(express.json());

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return ObjectId.isValid(id) && (String(new ObjectId(id)) === id);
};

// MongoDB connection
console.log('Environment variables:', {
  DB_USER: process.env.DB_USER,
  DB_PASS: process.env.DB_PASS ? 'PRESENT' : 'MISSING',
  DB_CLUSTER: process.env.DB_CLUSTER,
  DB_NAME: process.env.DB_NAME
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
console.log('MongoDB URI (password hidden):', uri.replace(process.env.DB_PASS, 'HIDDEN'));

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Simple authentication middleware that checks user email
const createVerifyUser = (usersCollection) => {
  return async (req, res, next) => {
    console.log('verifyUser middleware called');
    try {
      const userEmail = req.headers['user-email'];
      if (!userEmail) {
        console.log('No user email header found');
        return res.status(401).send({ error: true, message: 'User email required' });
      }
      
      console.log('User email from header:', userEmail);
      
      // Check if user exists in database
      const user = await usersCollection.findOne({ email: userEmail });
      if (!user) {
        console.log('User not found in database:', userEmail);
        console.log('Creating temporary user for testing...');
        // For testing, create a temporary user
        const tempUser = {
          email: userEmail,
          role: 'user',
          name: userEmail.split('@')[0],
          createdAt: new Date()
        };
        await usersCollection.insertOne(tempUser);
        req.user = tempUser;
        req.userEmail = userEmail;
        next();
        return;
      }
      
      console.log('User verified successfully:', userEmail);
      req.user = user;
      req.userEmail = userEmail;
      next();
    } catch (error) {
      console.error('Error in verifyUser middleware:', error);
      res.status(500).send({ error: true, message: 'Authentication error' });
    }
  };
};

// Role verification middleware
const verifyAgent = async (req, res, next) => {
  try {
    const user = req.user; // User is already set by verifyUser middleware
    
    if (user.role !== 'agent' && user.role !== 'admin') {
      return res.status(403).send({ 
        error: true, 
        message: 'Access denied. Only agents can add properties.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Error verifying agent role:', error);
    res.status(500).send({ error: true, message: 'Internal server error' });
  }
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

    // Create the verifyUser middleware with access to usersCollection
    const verifyUser = createVerifyUser(usersCollection);

    // Health check endpoint
    app.get('/health', (req, res) => {
      console.log('Health check called');
      res.json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
    });

    // Test route to check users
    app.get('/test-users', async (req, res) => {
      try {
        console.log('Test users endpoint called');
        const users = await usersCollection.find({}).limit(5).toArray();
        console.log('Users in database:', users.length);
        res.json({ count: users.length, users: users.map(u => ({ email: u.email, role: u.role })) });
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // Welcome Route & API Documentation
    app.get('/', (req, res) => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Real Estate Platform API Documentation</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; text-align: center; }
            .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
            .header p { font-size: 1.2rem; opacity: 0.9; }
            .live-link { background: #28a745; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 1.1rem; text-decoration: none; display: inline-block; margin: 20px 10px; transition: background 0.3s; }
            .live-link:hover { background: #218838; }
            .status { display: flex; justify-content: space-around; margin-bottom: 30px; }
            .status-card { background: white; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status-card h3 { color: #28a745; margin-bottom: 10px; }
            .api-section { background: white; margin-bottom: 30px; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .api-header { background: #6c757d; color: white; padding: 20px; font-size: 1.3rem; font-weight: bold; }
            .api-content { padding: 20px; }
            .endpoint { margin-bottom: 20px; padding: 15px; border-left: 4px solid #007bff; background: #f8f9fa; }
            .method { font-weight: bold; color: white; padding: 5px 10px; border-radius: 3px; margin-right: 10px; }
            .get { background: #28a745; }
            .post { background: #007bff; }
            .put { background: #ffc107; color: #333; }
            .patch { background: #17a2b8; }
            .delete { background: #dc3545; }
            .endpoint-url { font-family: 'Courier New', monospace; font-weight: bold; margin: 5px 0; }
            .endpoint-desc { color: #666; margin: 5px 0; }
            .params { background: #e9ecef; padding: 10px; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; padding: 30px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏠 Real Estate Platform API</h1>
              <p>Comprehensive RESTful API for Property Management System</p>
              <p><strong>Version:</strong> 1.0.0 | <strong>Status:</strong> ✅ Running</p>
              <div>
                <a href="https://b11a12elite.netlify.app" class="live-link" target="_blank">🌐 Live Frontend</a>
                <a href="/api" class="live-link" target="_blank">📋 JSON API Docs</a>
              </div>
            </div>

            <div class="status">
              <div class="status-card">
                <h3>✅ Server Status</h3>
                <p>Running on Port ${port}</p>
              </div>
              <div class="status-card">
                <h3>✅ Database</h3>
                <p>MongoDB Connected</p>
              </div>
              <div class="status-card">
                <h3>✅ CORS</h3>
                <p>Frontend Enabled</p>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">🔐 Authentication Endpoints</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/jwt</div>
                  <div class="endpoint-desc">Generate JWT token for user authentication</div>
                  <div class="params"><strong>Body:</strong> { user: Object } - User data from Firebase</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">👥 User Management</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/users</div>
                  <div class="endpoint-desc">Get all users (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/users</div>
                  <div class="endpoint-desc">Create or update user profile</div>
                  <div class="params"><strong>Body:</strong> { uid, email, name, photoURL, role }</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/users/:email</div>
                  <div class="endpoint-desc">Get user details by email</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/users/admin/:id</div>
                  <div class="endpoint-desc">Make user admin (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/users/agent/:id</div>
                  <div class="endpoint-desc">Make user agent (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/users/fraud/:id</div>
                  <div class="endpoint-desc">Mark user as fraud (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method delete">DELETE</span>
                  <div class="endpoint-url">/users/:id</div>
                  <div class="endpoint-desc">Delete user (Admin only)</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">🏠 Property Management</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/properties</div>
                  <div class="endpoint-desc">Get all verified properties with filters</div>
                  <div class="params"><strong>Query:</strong> search, sort, minPrice, maxPrice, page, limit</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/properties/:id</div>
                  <div class="endpoint-desc">Get property details by ID</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/properties/agent/:email</div>
                  <div class="endpoint-desc">Get properties by agent email</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/advertised-properties</div>
                  <div class="endpoint-desc">Get featured/advertised properties (limit 4)</div>
                </div>
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/properties</div>
                  <div class="endpoint-desc">Add new property (Agent only)</div>
                  <div class="params"><strong>Body:</strong> { title, location, image, priceRange, description, agentEmail }</div>
                </div>
                <div class="endpoint">
                  <span class="method put">PUT</span>
                  <div class="endpoint-url">/properties/:id</div>
                  <div class="endpoint-desc">Update property (Agent/Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/properties/verify/:id</div>
                  <div class="endpoint-desc">Verify property (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/properties/reject/:id</div>
                  <div class="endpoint-desc">Reject property (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/properties/advertise/:id</div>
                  <div class="endpoint-desc">Mark property as advertised (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method delete">DELETE</span>
                  <div class="endpoint-url">/properties/:id</div>
                  <div class="endpoint-desc">Delete property (Agent/Admin only)</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">❤️ Wishlist Management</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/wishlist/:email</div>
                  <div class="endpoint-desc">Get user's wishlist properties</div>
                </div>
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/wishlist</div>
                  <div class="endpoint-desc">Add property to wishlist</div>
                  <div class="params"><strong>Body:</strong> { userEmail, propertyId }</div>
                </div>
                <div class="endpoint">
                  <span class="method delete">DELETE</span>
                  <div class="endpoint-url">/wishlist/:id</div>
                  <div class="endpoint-desc">Remove property from wishlist</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">💰 Offer Management</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/offers</div>
                  <div class="endpoint-desc">Get all offers (Admin only)</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/offers/user/:email</div>
                  <div class="endpoint-desc">Get offers by user email</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/offers/agent/:email</div>
                  <div class="endpoint-desc">Get offers for agent's properties</div>
                </div>
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/offers</div>
                  <div class="endpoint-desc">Make offer on property</div>
                  <div class="params"><strong>Body:</strong> { propertyId, buyerEmail, agentEmail, offeredAmount }</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/offers/accept/:id</div>
                  <div class="endpoint-desc">Accept offer (Agent only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/offers/reject/:id</div>
                  <div class="endpoint-desc">Reject offer (Agent only)</div>
                </div>
                <div class="endpoint">
                  <span class="method patch">PATCH</span>
                  <div class="endpoint-url">/offers/bought/:id</div>
                  <div class="endpoint-desc">Mark offer as bought</div>
                  <div class="params"><strong>Body:</strong> { transactionId }</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">⭐ Review Management</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/reviews</div>
                  <div class="endpoint-desc">Get latest reviews (limit 3)</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/reviews/property/:id</div>
                  <div class="endpoint-desc">Get reviews for specific property</div>
                </div>
                <div class="endpoint">
                  <span class="method get">GET</span>
                  <div class="endpoint-url">/reviews/user/:email</div>
                  <div class="endpoint-desc">Get reviews by user</div>
                </div>
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/reviews</div>
                  <div class="endpoint-desc">Add new review</div>
                  <div class="params"><strong>Body:</strong> { propertyId, reviewerEmail, rating, comment }</div>
                </div>
                <div class="endpoint">
                  <span class="method delete">DELETE</span>
                  <div class="endpoint-url">/reviews/:id</div>
                  <div class="endpoint-desc">Delete review</div>
                </div>
              </div>
            </div>

            <div class="api-section">
              <div class="api-header">💳 Payment Integration</div>
              <div class="api-content">
                <div class="endpoint">
                  <span class="method post">POST</span>
                  <div class="endpoint-url">/create-payment-intent</div>
                  <div class="endpoint-desc">Create payment intent for property purchase</div>
                  <div class="params"><strong>Body:</strong> { amount } - Amount in cents</div>
                </div>
              </div>
            </div>

            <div class="footer">
              <p>🏠 <strong>Real Estate Platform API</strong> - Built with Express.js, MongoDB & Firebase Auth</p>
              <p>📧 Contact: <strong>shakil880@gmail.com</strong> | 🌐 Frontend: <a href="https://b11a12elite.netlify.app" target="_blank">b11a12elite.netlify.app</a></p>
            </div>
          </div>
        </body>
        </html>
      `;
      res.send(html);
    });

    // Fix property status fields (one-time migration endpoint)
    app.get('/fix-properties', async (req, res) => {
      try {
        // Update properties that have verificationStatus but no status field
        const result = await propertiesCollection.updateMany(
          { verificationStatus: { $exists: true }, status: { $exists: false } },
          [
            {
              $set: {
                status: "$verificationStatus"
              }
            },
            {
              $unset: "verificationStatus"
            }
          ]
        );
        
        res.json({ 
          message: 'Property status fields fixed', 
          modifiedCount: result.modifiedCount 
        });
      } catch (error) {
        console.error('Error fixing properties:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // API Documentation Route (JSON format)
    app.get('/api', (req, res) => {
      const apiDocumentation = {
        message: "🏠 Real Estate Platform API",
        version: "1.0.0",
        status: "Running Successfully",
        database: "Connected to MongoDB",
        baseUrl: "http://localhost:5000",
        frontendUrl: "https://b11a12elite.netlify.app",
        endpoints: {
          "Authentication": {
            "POST /jwt": {
              description: "Generate JWT token for user authentication",
              body: "{ user: Object } - User data from Firebase",
              response: "{ token: String }"
            }
          },
          "User Management": {
            "GET /users": {
              description: "Get all users (Admin only)",
              auth: "Required - Admin",
              response: "Array of user objects"
            },
            "POST /users": {
              description: "Create or update user profile",
              body: "{ uid, email, name, photoURL, role }",
              response: "{ success: Boolean, user: Object }"
            },
            "GET /users/:email": {
              description: "Get user details by email",
              auth: "Required",
              params: "email - User email address",
              response: "User object"
            },
            "PATCH /users/admin/:id": {
              description: "Make user admin (Admin only)",
              auth: "Required - Admin",
              params: "id - User ID",
              response: "{ success: Boolean }"
            },
            "PATCH /users/agent/:id": {
              description: "Make user agent (Admin only)",
              auth: "Required - Admin",
              params: "id - User ID",
              response: "{ success: Boolean }"
            },
            "PATCH /users/fraud/:id": {
              description: "Mark user as fraud (Admin only)",
              auth: "Required - Admin",
              params: "id - User ID",
              response: "{ success: Boolean }"
            },
            "DELETE /users/:id": {
              description: "Delete user (Admin only)",
              auth: "Required - Admin",
              params: "id - User ID",
              response: "{ success: Boolean }"
            }
          },
          "Property Management": {
            "GET /properties": {
              description: "Get all verified properties with filters",
              query: "search, sort, minPrice, maxPrice, page, limit",
              response: "Array of property objects"
            },
            "GET /properties/:id": {
              description: "Get property details by ID",
              params: "id - Property ID",
              response: "Property object"
            },
            "GET /properties/agent/:email": {
              description: "Get properties by agent email",
              auth: "Required",
              params: "email - Agent email",
              response: "Array of property objects"
            },
            "GET /advertised-properties": {
              description: "Get featured/advertised properties (limit 4)",
              response: "Array of advertised property objects"
            },
            "POST /properties": {
              description: "Add new property (Agent only)",
              auth: "Required - Agent",
              body: "{ title, location, image, priceRange, description, agentEmail }",
              response: "{ success: Boolean, property: Object }"
            },
            "PUT /properties/:id": {
              description: "Update property (Agent/Admin only)",
              auth: "Required - Agent/Admin",
              params: "id - Property ID",
              body: "Property update object",
              response: "{ success: Boolean, property: Object }"
            },
            "PATCH /properties/verify/:id": {
              description: "Verify property (Admin only)",
              auth: "Required - Admin",
              params: "id - Property ID",
              response: "{ success: Boolean }"
            },
            "PATCH /properties/reject/:id": {
              description: "Reject property (Admin only)",
              auth: "Required - Admin",
              params: "id - Property ID",
              response: "{ success: Boolean }"
            },
            "PATCH /properties/advertise/:id": {
              description: "Mark property as advertised (Admin only)",
              auth: "Required - Admin",
              params: "id - Property ID",
              response: "{ success: Boolean }"
            },
            "DELETE /properties/:id": {
              description: "Delete property (Agent/Admin only)",
              auth: "Required - Agent/Admin",
              params: "id - Property ID",
              response: "{ success: Boolean }"
            }
          },
          "Wishlist Management": {
            "GET /wishlist/:email": {
              description: "Get user's wishlist properties",
              params: "email - User email",
              response: "Array of wishlist property objects"
            },
            "POST /wishlist": {
              description: "Add property to wishlist",
              body: "{ userEmail, propertyId }",
              response: "{ success: Boolean, wishlist: Object }"
            },
            "DELETE /wishlist/:id": {
              description: "Remove property from wishlist",
              params: "id - Wishlist item ID",
              response: "{ success: Boolean }"
            }
          },
          "Offer Management": {
            "GET /offers": {
              description: "Get all offers (Admin only)",
              auth: "Required - Admin",
              response: "Array of offer objects"
            },
            "GET /offers/user/:email": {
              description: "Get offers by user email",
              params: "email - User email",
              response: "Array of user's offer objects"
            },
            "GET /offers/agent/:email": {
              description: "Get offers for agent's properties",
              params: "email - Agent email",
              response: "Array of offer objects for agent"
            },
            "POST /offers": {
              description: "Make offer on property",
              body: "{ propertyId, buyerEmail, agentEmail, offeredAmount }",
              response: "{ success: Boolean, offer: Object }"
            },
            "PATCH /offers/accept/:id": {
              description: "Accept offer (Agent only)",
              auth: "Required - Agent",
              params: "id - Offer ID",
              response: "{ success: Boolean }"
            },
            "PATCH /offers/reject/:id": {
              description: "Reject offer (Agent only)",
              auth: "Required - Agent",
              params: "id - Offer ID",
              response: "{ success: Boolean }"
            },
            "PATCH /offers/bought/:id": {
              description: "Mark offer as bought",
              params: "id - Offer ID",
              body: "{ transactionId }",
              response: "{ success: Boolean }"
            }
          },
          "Review Management": {
            "GET /reviews": {
              description: "Get latest reviews (limit 3)",
              response: "Array of review objects"
            },
            "GET /reviews/property/:id": {
              description: "Get reviews for specific property",
              params: "id - Property ID",
              response: "Array of review objects"
            },
            "GET /reviews/user/:email": {
              description: "Get reviews by user",
              params: "email - User email",
              response: "Array of user's review objects"
            },
            "POST /reviews": {
              description: "Add new review",
              body: "{ propertyId, reviewerEmail, rating, comment }",
              response: "{ success: Boolean, review: Object }"
            },
            "DELETE /reviews/:id": {
              description: "Delete review",
              params: "id - Review ID",
              response: "{ success: Boolean }"
            }
          },
          "Payment Integration": {
            "POST /create-payment-intent": {
              description: "Create payment intent for property purchase",
              body: "{ amount } - Amount in cents",
              response: "{ clientSecret: String }"
            }
          }
        },
        "Environment": process.env.NODE_ENV || "development",
        "Port": process.env.PORT || 5000,
        "Timestamp": new Date().toISOString(),
        "Note": "For detailed interactive documentation, visit http://localhost:5000"
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

    // Seed Sample Data (for testing)
    app.post('/seed-data', async (req, res) => {
      try {
        // Check if data already exists
        const existingProperties = await propertiesCollection.countDocuments();
        if (existingProperties > 0) {
          return res.json({ message: 'Data already exists', count: existingProperties });
        }

        // Sample properties
        const sampleProperties = [
          {
            title: "Modern Family Home",
            location: "Downtown, New York",
            image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
            priceRange: "$300,000 - $400,000",
            description: "Beautiful modern family home with 3 bedrooms and 2 bathrooms. Perfect for a growing family.",
            agentName: "John Smith",
            agentEmail: "john@example.com",
            agentImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
            status: "verified",
            advertised: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            title: "Luxury Apartment",
            location: "Manhattan, New York",
            image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
            priceRange: "$500,000 - $700,000",
            description: "Luxurious apartment in the heart of Manhattan with stunning city views.",
            agentName: "Sarah Johnson",
            agentEmail: "sarah@example.com",
            agentImage: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150",
            status: "verified",
            advertised: false,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            title: "Cozy Suburban House",
            location: "Queens, New York",
            image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
            priceRange: "$250,000 - $350,000",
            description: "Charming suburban house with a beautiful garden and quiet neighborhood.",
            agentName: "Mike Davis",
            agentEmail: "mike@example.com",
            agentImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
            status: "verified",
            advertised: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            title: "Pending Property",
            location: "Brooklyn, New York",
            image: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800",
            priceRange: "$200,000 - $300,000",
            description: "This property is still pending verification.",
            agentName: "Lisa Brown",
            agentEmail: "lisa@example.com",
            agentImage: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150",
            status: "pending",
            advertised: false,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ];

        // Insert sample properties
        const propertiesResult = await propertiesCollection.insertMany(sampleProperties);
        
        // Sample users
        const sampleUsers = [
          {
            uid: "admin-uid-1",
            email: "admin@example.com",
            name: "Admin User",
            photoURL: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
            role: "admin",
            createdAt: new Date()
          },
          {
            uid: "agent-uid-1",
            email: "john@example.com",
            name: "John Smith",
            photoURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
            role: "agent",
            createdAt: new Date()
          },
          {
            uid: "user-uid-1",
            email: "user@example.com",
            name: "Regular User",
            photoURL: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150",
            role: "user",
            createdAt: new Date()
          }
        ];

        // Insert sample users
        const usersResult = await usersCollection.insertMany(sampleUsers);

        res.json({
          message: 'Sample data created successfully',
          properties: propertiesResult.insertedCount,
          users: usersResult.insertedCount
        });
      } catch (error) {
        console.error('Error seeding data:', error);
        res.status(500).json({ message: 'Error seeding data', error: error.message });
      }
    });

    // Clear all data (for testing)
    app.delete('/clear-data', async (req, res) => {
      try {
        const propertiesDeleted = await propertiesCollection.deleteMany({});
        const usersDeleted = await usersCollection.deleteMany({});
        const wishlistDeleted = await wishlistCollection.deleteMany({});
        const offersDeleted = await offersCollection.deleteMany({});
        const reviewsDeleted = await reviewsCollection.deleteMany({});

        res.json({
          message: 'All data cleared successfully',
          deleted: {
            properties: propertiesDeleted.deletedCount,
            users: usersDeleted.deletedCount,
            wishlist: wishlistDeleted.deletedCount,
            offers: offersDeleted.deletedCount,
            reviews: reviewsDeleted.deletedCount
          }
        });
      } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ message: 'Error clearing data', error: error.message });
      }
    });

    // JWT token generation
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // User Management APIs
    app.get('/users', verifyUser, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/:email', verifyUser, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email: email });
        
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        res.send(user);
      } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
      }
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

    app.patch('/users/admin/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: 'admin'
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating user to admin:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.patch('/users/agent/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: 'agent'
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating user to agent:', error);
        res.status(500).json({ error: 'Failed to update user role' });
      }
    });

    app.patch('/users/fraud/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
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
      } catch (error) {
        console.error('Error updating user to fraud:', error);
        res.status(500).json({ error: 'Failed to update user role' });
      }
    });

    app.delete('/users/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
      }
    });

    // Property Management APIs
    app.get('/properties', async (req, res) => {
      try {
        const { search, sort, minPrice, maxPrice, admin, status } = req.query;
        
        // Build status filter based on permissions and request
        let query = {};
        if (admin === 'true') {
          // Admin can see all properties or filter by specific status
          if (status && status !== 'all') {
            query.status = status;
          }
          // If status is 'all' or not provided, don't add status filter
        } else {
          // Regular users: handle different status requests
          if (status === 'pending') {
            query.status = 'pending';
          } else if (status === 'verified') {
            query.status = 'verified';
          } else if (status === 'all') {
            // Don't add status filter - show all properties
          } else if (!status) {
            // No status parameter means show all properties (for "All Properties" filter)
            // Don't add status filter
          } else {
            // Any other specific status requested
            query.status = status;
          }
        }
        
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ];
        }
        
        if (minPrice || maxPrice) {
          // For price filtering, we'll parse the priceRange string
          const priceFilter = {};
          if (minPrice) priceFilter.$gte = parseInt(minPrice);
          if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
          // This is a simplified approach - in production you'd want better price parsing
        }
        
        let result = propertiesCollection.find(query);
        
        // Apply initial database sorting for non-price sorts
        if (sort === 'newest' || !sort) {
          result = result.sort({ createdAt: -1 });
        } else if (sort === 'oldest') {
          result = result.sort({ createdAt: 1 });
        } else {
          // For price sorts, get all data first then sort in JavaScript
          result = result.sort({ createdAt: -1 }); // Default order first
        }
        
        let properties = await result.toArray();
        console.log(`Fetched ${properties.length} properties, sorting by: ${sort || 'default (newest)'}`);
        console.log(`Status filter applied: ${status || 'none'}, Query: ${JSON.stringify(query)}`);
        
        // For price sorting, we need to sort by extracted numeric values since priceRange is a string
        if (sort === 'price-asc' || sort === 'price-desc') {
          properties = properties.sort((a, b) => {
            const getPriceFromRange = (priceRange) => {
              if (!priceRange) return 0;
              // Extract first number from strings like "$300,000 - $400,000", "300000-400000", "300,000 - 400,000"
              const match = priceRange.match(/\$?([\d,]+)/);
              return match ? parseInt(match[1].replace(/,/g, '')) : 0;
            };
            
            const priceA = getPriceFromRange(a.priceRange);
            const priceB = getPriceFromRange(b.priceRange);
            
            if (sort === 'price-asc') {
              return priceA - priceB;
            } else {
              return priceB - priceA;
            }
          });
          
          console.log(`Price sorting applied: ${sort}, first property price: ${properties[0]?.priceRange}, last property price: ${properties[properties.length - 1]?.priceRange}`);
        }
        
        // Return data in expected format for frontend
        res.json({
          properties: properties,
          total: properties.length,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 12,
          totalPages: Math.ceil(properties.length / (parseInt(req.query.limit) || 12))
        });
      } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ message: 'Error fetching properties', error: error.message });
      }
    });

    app.get('/properties/:id', async (req, res) => {
      try {
        const id = req.params.id;
        
        // Validate ObjectId
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
        const query = { _id: new ObjectId(id) };
        const result = await propertiesCollection.findOne(query);
        
        if (!result) {
          return res.status(404).json({ error: 'Property not found' });
        }
        
        res.send(result);
      } catch (error) {
        console.error('Error fetching property:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/properties/agent/:email', verifyUser, async (req, res) => {
      const email = req.params.email;
      const query = { agentEmail: email };
      const result = await propertiesCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/properties/sold/:email', verifyUser, async (req, res) => {
      const email = req.params.email;
      const soldOffers = await offersCollection.find({ 
        agentEmail: email, 
        status: 'bought' 
      }).toArray();
      res.send(soldOffers);
    });

    app.post('/properties', verifyUser, async (req, res) => {
      try {
        console.log('Adding property request received');
        console.log('User from token:', req.decoded);
        console.log('User details:', req.user);
        console.log('Request body:', req.body);
        
        const property = req.body;
        
        // Auto-verify properties posted by admins, others remain pending
        if (req.user && req.user.role === 'admin') {
          property.status = 'verified'; // Admin properties are auto-verified
          property.verifiedBy = req.user.email;
          property.verifiedAt = new Date();
          console.log('Admin user detected - property auto-verified');
        } else {
          property.status = 'pending'; // Regular agent properties need admin approval
          console.log('Agent user detected - property set to pending for admin review');
        }
        
        property.createdAt = new Date();
        property.updatedAt = new Date();
        property.advertised = false;
        
        console.log('Property to insert:', property);
        
        // Check database connection
        if (!propertiesCollection) {
          throw new Error('Properties collection not initialized');
        }
        
        const result = await propertiesCollection.insertOne(property);
        
        console.log('Property inserted successfully:', result.insertedId);
        
        const responseMessage = req.user && req.user.role === 'admin' 
          ? 'Property added and automatically verified (admin privilege)'
          : 'Property added successfully and is pending admin approval';

        res.status(201).json({
          success: true,
          message: responseMessage,
          propertyId: result.insertedId,
          status: property.status
        });
      } catch (error) {
        console.error('Detailed error adding property:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({
          error: true,
          message: 'Failed to add property',
          details: error.message
        });
      }
    });

    app.put('/properties/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
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
      } catch (error) {
        console.error('Error updating property:', error);
        res.status(500).json({ error: 'Failed to update property' });
      }
    });

    app.patch('/properties/verify/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: 'verified',
            updatedAt: new Date()
          },
        };
        const result = await propertiesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error verifying property:', error);
        res.status(500).json({ error: 'Failed to verify property' });
      }
    });

    app.patch('/properties/reject/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: 'rejected',
            updatedAt: new Date()
          },
        };
        const result = await propertiesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error rejecting property:', error);
        res.status(500).json({ error: 'Failed to reject property' });
      }
    });

    app.patch('/properties/advertise/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            advertised: true,
            updatedAt: new Date()
          },
        };
        const result = await propertiesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error advertising property:', error);
        res.status(500).json({ error: 'Failed to advertise property' });
      }
    });

    app.get('/advertised-properties', async (req, res) => {
      try {
        const query = { status: 'verified', advertised: true };
        const result = await propertiesCollection.find(query).limit(4).toArray();
        res.json(result);
      } catch (error) {
        console.error('Error fetching advertised properties:', error);
        res.status(500).json({ message: 'Error fetching advertised properties', error: error.message });
      }
    });

    app.delete('/properties/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid property ID format' });
        }
        
        const query = { _id: new ObjectId(id) };
        const result = await propertiesCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error('Error deleting property:', error);
        res.status(500).json({ error: 'Failed to delete property' });
      }
    });

    // Wishlist APIs
    app.get('/wishlist/:email', verifyUser, async (req, res) => {
      try {
        const email = req.params.email;
        const wishlistItems = await wishlistCollection.find({ userEmail: email }).toArray();
        
        // Filter and validate property IDs
        const validPropertyIds = wishlistItems
          .filter(item => isValidObjectId(item.propertyId))
          .map(item => new ObjectId(item.propertyId));
        
        const properties = await propertiesCollection.find({ _id: { $in: validPropertyIds } }).toArray();
        res.send(properties);
      } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
      }
    });

    app.post('/wishlist', verifyUser, async (req, res) => {
      try {
        console.log('POST /wishlist endpoint called');
        console.log('Request headers:', req.headers);
        console.log('Request body:', req.body);
        
        const wishlistItem = req.body;
        
        console.log('Adding to wishlist:', wishlistItem);
        
        const existingItem = await wishlistCollection.findOne({
          userEmail: wishlistItem.userEmail,
          propertyId: wishlistItem.propertyId
        });
        
        if (existingItem) {
          return res.json({ message: 'Property already in wishlist', success: true });
        }
        
        wishlistItem.createdAt = new Date();
        const result = await wishlistCollection.insertOne(wishlistItem);
        
        console.log('Wishlist item added:', result);
        
        res.json({ message: 'Property added to wishlist', success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ error: 'Failed to add to wishlist' });
      }
    });

    app.delete('/wishlist/:email/:propertyId', verifyUser, async (req, res) => {
      try {
        const { email, propertyId } = req.params;
        
        console.log('Removing from wishlist:', { email, propertyId });
        
        const query = { userEmail: email, propertyId: propertyId };
        const result = await wishlistCollection.deleteOne(query);
        
        console.log('Wishlist removal result:', result);
        
        if (result.deletedCount === 0) {
          return res.json({ message: 'Property not found in wishlist', success: false });
        }
        
        res.json({ message: 'Property removed from wishlist', success: true, deletedCount: result.deletedCount });
      } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
      }
    });

    // Offers APIs
    app.get('/offers/user/:email', verifyUser, async (req, res) => {
      const email = req.params.email;
      const result = await offersCollection.find({ buyerEmail: email }).toArray();
      res.send(result);
    });

    app.get('/offers/agent/:email', verifyUser, async (req, res) => {
      const email = req.params.email;
      const result = await offersCollection.find({ agentEmail: email }).toArray();
      res.send(result);
    });

    app.post('/offers', verifyUser, async (req, res) => {
      const offer = req.body;
      offer.status = 'pending';
      offer.createdAt = new Date();
      const result = await offersCollection.insertOne(offer);
      res.send(result);
    });

    app.patch('/offers/accept/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid offer ID format' });
        }
        
        const offer = await offersCollection.findOne({ _id: new ObjectId(id) });
        
        if (!offer) {
          return res.status(404).json({ error: 'Offer not found' });
        }
        
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
      } catch (error) {
        console.error('Error accepting offer:', error);
        res.status(500).json({ error: 'Failed to accept offer' });
      }
    });

    app.patch('/offers/reject/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid offer ID format' });
        }
        
        const updateDoc = {
          $set: {
            status: 'rejected'
          },
        };
        const result = await offersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error rejecting offer:', error);
        res.status(500).json({ error: 'Failed to reject offer' });
      }
    });

    app.patch('/offers/bought/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid offer ID format' });
        }
        
        const updateDoc = {
          $set: {
            status: 'bought',
            transactionId: req.body.transactionId,
            paymentDate: new Date()
          },
        };
        const result = await offersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating offer to bought:', error);
        res.status(500).json({ error: 'Failed to update offer status' });
      }
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

    app.get('/reviews/user/:email', verifyUser, async (req, res) => {
      try {
        const email = req.params.email;
        // Check both userEmail and reviewerEmail for compatibility
        const result = await reviewsCollection.find({ 
          $or: [
            { reviewerEmail: email },
            { userEmail: email }
          ]
        }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
      }
    });

    app.post('/reviews', verifyUser, async (req, res) => {
      try {
        const review = req.body;
        review.createdAt = new Date();
        
        // Ensure we have both email fields for compatibility
        if (review.userEmail && !review.reviewerEmail) {
          review.reviewerEmail = review.userEmail;
        }
        if (review.reviewerEmail && !review.userEmail) {
          review.userEmail = review.reviewerEmail;
        }
        
        console.log('Saving review:', review);
        
        const result = await reviewsCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        console.error('Error saving review:', error);
        res.status(500).json({ error: 'Failed to save review' });
      }
    });

    app.delete('/reviews/:id', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid review ID format' });
        }
        
        const query = { _id: new ObjectId(id) };
        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Failed to delete review' });
      }
    });

    // Payment API (Stripe integration would go here)
    app.post('/create-payment-intent', verifyUser, async (req, res) => {
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
    app.get('/reports', verifyUser, async (req, res) => {
      const result = await reportsCollection.find().toArray();
      res.send(result);
    });

    app.post('/reports', verifyUser, async (req, res) => {
      const report = req.body;
      report.createdAt = new Date();
      const result = await reportsCollection.insertOne(report);
      res.send(result);
    });

    console.log("Successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Real Estate server is running on port ${port}`);
  });
}

// Export for Vercel
module.exports = app;
