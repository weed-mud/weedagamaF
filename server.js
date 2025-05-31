const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const expressLayouts = require('express-ejs-layouts'); 

const app = express();
const PORT = process.env.PORT || 3097;

// Trust proxy - IMPORTANT for HAProxy
app.set('trust proxy', true);

// Custom morgan token for real IP
morgan.token('real-ip', (req) => {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip;
});

// Custom morgan format with real IP
const logFormat = ':real-ip - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

// Security middleware
app.use(helmet());
app.use(morgan(logFormat));

// Middleware to log IP for debugging (optional)
app.use((req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   req.ip;
  
  // Store IP in request object for use in routes
  req.clientIp = clientIp;
  
  // Debug logging (remove in production)
  console.log(`Client IP: ${clientIp}, Path: ${req.path}`);
  
  next();
});

// Session configuration
app.use(session({
  secret: 'weedagama-foundation-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add layout middleware
app.use(expressLayouts);
app.set('layout', 'layout');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('foundation.db');

// Create tables
db.serialize(() => {
  // Applications table - Added client_ip field
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_name TEXT NOT NULL,
    principal_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    student_count INTEGER NOT NULL,
    request_type TEXT NOT NULL,
    amount_requested REAL,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    client_ip TEXT
  )`);

  // Add client_ip column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE applications ADD COLUMN client_ip TEXT`, (err) => {
    // Ignore error if column already exists
  });

  

  // Blog posts table
  db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published BOOLEAN DEFAULT 1
  )`);

  //Projects table
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    schools_count INTEGER,
    students_count INTEGER,
    investment TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published BOOLEAN DEFAULT 1
  )`);

  // Users table for admin
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  )`);

  // Access logs table for tracking
  db.run(`CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Stats table for homepage statistics
  db.run(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_key TEXT UNIQUE NOT NULL,
    stat_value INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Initialize default stats if not exists
  db.get("SELECT COUNT(*) as count FROM stats", (err, row) => {
    if (row.count === 0) {
      const defaultStats = [
        { key: 'schools_supported', value: 47 },
        { key: 'students_helped', value: 1250 },
        { key: 'meals_served', value: 12500 },
        { key: 'communities_reached', value: 23 }
      ];
      
      defaultStats.forEach(stat => {
        db.run("INSERT INTO stats (stat_key, stat_value) VALUES (?, ?)", 
          [stat.key, stat.value]);
      });
    }
  });

  // Insert sample blog posts
  db.get("SELECT COUNT(*) as count FROM blog_posts", (err, row) => {
    if (row.count === 0) {
      const samplePosts = [
        {
          title: "New School Project in Rural Sri Lanka",
          content: "We are excited to announce our partnership with a rural school in Sri Lanka to provide essential educational supplies and infrastructure improvements. This project will benefit over 200 students and includes providing notebooks, pens, pencils, and basic classroom supplies. Our team worked closely with the school administration to identify the most pressing needs and ensure that our support will have the maximum impact on student learning outcomes.",
          author: "Foundation Team",
          image_url: "/images/school-project.jpg"
        },
        {
          title: "Medical Equipment Donation Drive Success",
          content: "Thanks to the generous support of our donors, we have successfully provided medical equipment to three healthcare facilities in underserved communities. The donation included essential diagnostic equipment, patient monitoring devices, and basic medical supplies. This initiative will directly improve healthcare access for over 5,000 community members and strengthen the capacity of local healthcare providers.",
          author: "Foundation Team",
          image_url: "/images/medical-donation.jpg"
        },
        {
          title: "Food Security Initiative Launch",
          content: "Our new food security initiative aims to address hunger in local communities through sustainable food distribution programs and agricultural support. We are partnering with local farmers to establish community gardens and provide training on sustainable farming practices. This program will help ensure long-term food security while also supporting local economic development.",
          author: "Foundation Team",
          image_url: "/images/food-initiative.jpg"
        }
      ];

      samplePosts.forEach(post => {
        db.run(`INSERT INTO blog_posts (title, content, author, image_url) VALUES (?, ?, ?, ?)`,
          [post.title, post.content, post.author, post.image_url]);
      });
    }
  });

  // Insert sample projects if none exist
  db.get("SELECT COUNT(*) as count FROM projects", (err, row) => {
    if (row.count === 0) {
      const sampleProjects = [
        {
          title: "Rural Education Initiative",
          description: "Providing essential school supplies and educational resources to rural schools in Sri Lanka. This ongoing project has benefited over 1,000 students across 25 schools.",
          image_url: "https://source.unsplash.com/500x250/?school,education,children",
          schools_count: 25,
          students_count: 1000,
          investment: "$45K"
        },
        {
          title: "Food Program",
          description: "Provide a daily meal cooked on site.",
          image_url: "/images/food-program.png",
          schools_count: 5,
          students_count: 50,
          investment: "10,000 Meals/Year"
        }
      ];

      sampleProjects.forEach(project => {
        db.run(`INSERT INTO projects (title, description, image_url, schools_count, students_count, investment) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          [project.title, project.description, project.image_url, project.schools_count, project.students_count, project.investment]);
      });
    }
  });

  // Create default admin user
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row.count === 0) {
      bcrypt.hash('admin123', 10, (err, hash) => {
        if (!err) {
          db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hash]);
        }
      });
    }
  });
});

// Email configuration (optional - will work without email setup)
let transporter;
try {
  transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
} catch (error) {
  console.log('Email not configured. Contact forms will not send emails.');
}

// Middleware to log access to database (optional)
function logAccess(req, res, next) {
  const ip = req.clientIp;
  const path = req.path;
  const method = req.method;
  const userAgent = req.headers['user-agent'];
  
  db.run(`INSERT INTO access_logs (ip_address, path, method, user_agent) VALUES (?, ?, ?, ?)`,
    [ip, path, method, userAgent], (err) => {
      if (err) console.error('Access log error:', err);
    });
  
  next();
}

// Apply access logging to specific routes if needed
// app.use('/apply', logAccess);
// app.use('/admin', logAccess);

// Routes
app.get('/', (req, res) => {
  // Get stats from database
  db.all("SELECT * FROM stats", (err, statsRows) => {
    const stats = {};
    if (statsRows) {
      statsRows.forEach(row => {
        stats[row.stat_key] = row.stat_value;
      });
    }
    
    // Provide defaults if not found
    const finalStats = {
      schoolsSupported: stats.schools_supported || 0,
      studentsHelped: stats.students_helped || 0,
      mealsServed: stats.meals_served || 0,
      communitiesReached: stats.communities_reached || 0
    };
    
    db.all("SELECT * FROM blog_posts WHERE published = 1 ORDER BY created_at DESC LIMIT 3", (err, posts) => {
      res.render('index', { 
        posts: posts || [], 
        stats: finalStats,
        title: 'Home'
      });
    });
  });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

app.get('/projects', (req, res) => {
  db.all("SELECT * FROM projects WHERE published = 1 ORDER BY created_at DESC", (err, projects) => {
    res.render('projects', { 
      projects: projects || [],
      title: 'Our Projects'
    });
  });
});

app.get('/apply', (req, res) => {
  res.render('apply', { title: 'Apply for Support' });
});

app.get('/blog', (req, res) => {
  db.all("SELECT * FROM blog_posts WHERE published = 1 ORDER BY created_at DESC", (err, posts) => {
    res.render('blog', { 
      posts: posts || [],
      title: 'News & Updates'
    });
  });
});

app.get('/blog/:id', (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM blog_posts WHERE id = ? AND published = 1", [id], (err, post) => {
    if (post) {
      res.render('blog-post', { 
        post,
        title: post.title
      });
    } else {
      res.redirect('/blog');
    }
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us' });
});

// Application submission - Now logs client IP
app.post('/apply', [
  body('school_name').notEmpty().withMessage('School name is required'),
  body('principal_name').notEmpty().withMessage('Principal name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('student_count').isInt({ min: 1 }).withMessage('Student count must be a positive number'),
  body('request_type').notEmpty().withMessage('Request type is required'),
  body('description').notEmpty().withMessage('Description is required')
], (req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.render('apply', { 
      errors: errors.array(), 
      formData: req.body,
      title: 'Apply for Support'
    });
  }

  const {
    school_name, principal_name, email, phone, address,
    student_count, request_type, amount_requested, description
  } = req.body;

  // Get client IP
  const clientIp = req.clientIp;

  db.run(`INSERT INTO applications 
    (school_name, principal_name, email, phone, address, student_count, request_type, amount_requested, description, client_ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [school_name, principal_name, email, phone, address, student_count, request_type, amount_requested, description, clientIp],
    function(err) {
      if (err) {
        console.error(err);
        return res.render('apply', { 
          error: 'Application submission failed. Please try again.',
          title: 'Apply for Support'
        });
      }

      console.log(`Application submitted from IP: ${clientIp}`);

      // Send confirmation email (if configured)
      if (transporter) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Application Received - Weedagama Foundation',
          html: `
            <h2>Thank you for your application!</h2>
            <p>Dear ${principal_name},</p>
            <p>We have received your application for ${school_name}. Our team will review your request and contact you within 5-7 business days.</p>
            <p>Application Details:</p>
            <ul>
              <li>School: ${school_name}</li>
              <li>Request Type: ${request_type}</li>
              <li>Students Affected: ${student_count}</li>
            </ul>
            <p>Best regards,<br>Weedagama Foundation Team</p>
          `
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log('Email error:', error);
          }
        });
      }

      res.render('apply-success', { title: 'Application Submitted Successfully' });
    }
  );
});

// Contact form POST route - Also log IP
app.post('/contact', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('message').notEmpty().withMessage('Message is required')
], (req, res) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.render('contact', { 
      errors: errors.array(), 
      formData: req.body,
      title: 'Contact Us'
    });
  }

  const { name, email, message } = req.body;
  const clientIp = req.clientIp;

  console.log(`Contact form submitted from IP: ${clientIp}`);

  if (transporter) {
    const mailOptions = {
      from: email,
      to: process.env.EMAIL_USER,
      subject: `Contact Form - ${name}`,
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>IP Address:</strong> ${clientIp}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email error:', error);
        return res.render('contact', { 
          error: 'Message could not be sent. Please try again.',
          title: 'Contact Us'
        });
      }
      res.render('contact', { 
        success: 'Thank you! Your message has been sent successfully.',
        title: 'Contact Us'
      });
    });
  } else {
    res.render('contact', { 
      success: 'Thank you! Your message has been received.',
      title: 'Contact Us'
    });
  }
});

// Admin routes
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.clientIp;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = user;
      console.log(`Admin login successful from IP: ${clientIp}`);
      res.redirect('/admin/dashboard');
    } else {
      console.log(`Failed admin login attempt from IP: ${clientIp}`);
      res.render('admin/login', { 
        error: 'Invalid credentials',
        title: 'Admin Login'
      });
    }
  });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.redirect('/admin/dashboard');
    }
    
    // Clear the session cookie
    res.clearCookie('connect.sid');
    
    // Redirect to login page
    res.redirect('/admin/login');
  });
});

app.get('/admin/dashboard', requireAuth, (req, res) => {
  db.all("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'", (err, pendingApps) => {
    db.all("SELECT COUNT(*) as count FROM blog_posts", (err, totalPosts) => {
      db.all("SELECT COUNT(*) as count FROM projects WHERE published = 1", (err, totalProjects) => {
        db.all("SELECT * FROM stats", (err, statsRows) => {
          const stats = {};
          if (statsRows) {
            statsRows.forEach(row => {
              stats[row.stat_key] = row.stat_value;
            });
          }
          
          res.render('admin/dashboard', { 
            pendingApplications: pendingApps[0] ? pendingApps[0].count : 0,
            totalPosts: totalPosts[0] ? totalPosts[0].count : 0,
            totalProjects: totalProjects[0] ? totalProjects[0].count : 0,
            stats: stats,
            title: 'Admin Dashboard'
          });
        });
      });
    });
  });
});

app.get('/admin/applications', requireAuth, (req, res) => {
  db.all("SELECT * FROM applications ORDER BY created_at DESC", (err, applications) => {
    res.render('admin/applications', { 
      applications: applications || [],
      title: 'Applications Management'
    });
  });
});

// View single application
app.get('/admin/applications/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get("SELECT * FROM applications WHERE id = ?", [id], (err, application) => {
    if (err || !application) {
      return res.redirect('/admin/applications');
    }
    res.render('admin/application-detail', { 
      application,
      title: 'Application Details'
    });
  });
});

// Update application status
app.post('/admin/applications/:id/status', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  db.run("UPDATE applications SET status = ? WHERE id = ?", [status, id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update status' });
    }
    res.json({ success: true });
  });
});

app.get('/admin/blog', requireAuth, (req, res) => {
  db.all("SELECT * FROM blog_posts ORDER BY created_at DESC", (err, posts) => {
    res.render('admin/blog', { 
      posts: posts || [],
      title: 'Blog Management'
    });
  });
});

app.get('/admin/blog/new', requireAuth, (req, res) => {
  res.render('admin/blog-form', { 
    post: null,
    title: 'Create New Blog Post'
  });
});

app.post('/admin/blog', requireAuth, (req, res) => {
  const { title, content, author, image_url } = req.body;
  
  db.run("INSERT INTO blog_posts (title, content, author, image_url) VALUES (?, ?, ?, ?)",
    [title, content, author, image_url], (err) => {
      if (err) {
        console.error(err);
        return res.render('admin/blog-form', { 
          error: 'Failed to create post',
          post: { title, content, author, image_url },
          title: 'Create New Blog Post'
        });
      }
      res.redirect('/admin/blog');
    });
});

// Edit blog post
app.get('/admin/blog/edit/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get("SELECT * FROM blog_posts WHERE id = ?", [id], (err, post) => {
    if (err || !post) {
      return res.redirect('/admin/blog');
    }
    res.render('admin/blog-form', { 
      post,
      title: 'Edit Blog Post'
    });
  });
});

app.post('/admin/blog/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { title, content, author, image_url, published } = req.body;
  
  db.run("UPDATE blog_posts SET title = ?, content = ?, author = ?, image_url = ?, published = ? WHERE id = ?",
    [title, content, author, image_url, published ? 1 : 0, id], (err) => {
      if (err) {
        console.error(err);
        return res.render('admin/blog-form', { 
          error: 'Failed to update post',
          post: { id, title, content, author, image_url, published },
          title: 'Edit Blog Post'
        });
      }
      res.redirect('/admin/blog');
    });
});

app.post('/admin/blog/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM blog_posts WHERE id = ?", [id], (err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/admin/blog');
  });
});

// Admin project routes
app.get('/admin/projects', requireAuth, (req, res) => {
  db.all("SELECT * FROM projects ORDER BY created_at DESC", (err, projects) => {
    res.render('admin/projects', { 
      projects: projects || [],
      title: 'Projects Management'
    });
  });
});

app.get('/admin/projects/new', requireAuth, (req, res) => {
  res.render('admin/project-form', { 
    project: null,
    title: 'Create New Project'
  });
});

app.post('/admin/projects', requireAuth, (req, res) => {
  const { title, description, image_url, schools_count, students_count, investment } = req.body;
  
  db.run(`INSERT INTO projects (title, description, image_url, schools_count, students_count, investment) 
          VALUES (?, ?, ?, ?, ?, ?)`,
    [title, description, image_url, schools_count || 0, students_count || 0, investment || ''], 
    (err) => {
      if (err) {
        console.error(err);
        return res.render('admin/project-form', { 
          error: 'Failed to create project',
          project: req.body,
          title: 'Create New Project'
        });
      }
      res.redirect('/admin/projects');
    });
});

app.get('/admin/projects/edit/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.get("SELECT * FROM projects WHERE id = ?", [id], (err, project) => {
    if (err || !project) {
      return res.redirect('/admin/projects');
    }
    res.render('admin/project-form', { 
      project,
      title: 'Edit Project'
    });
  });
});

app.post('/admin/projects/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { title, description, image_url, schools_count, students_count, investment, published } = req.body;
  
  db.run(`UPDATE projects 
          SET title = ?, description = ?, image_url = ?, schools_count = ?, students_count = ?, 
              investment = ?, published = ? 
          WHERE id = ?`,
    [title, description, image_url, schools_count || 0, students_count || 0, 
     investment || '', published ? 1 : 0, id], 
    (err) => {
      if (err) {
        console.error(err);
        return res.render('admin/project-form', { 
          error: 'Failed to update project',
          project: { id, ...req.body },
          title: 'Edit Project'
        });
      }
      res.redirect('/admin/projects');
    });
});

app.post('/admin/projects/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM projects WHERE id = ?", [id], (err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/admin/projects');
  });
});

// Admin stats management
app.get('/admin/stats', requireAuth, (req, res) => {
  db.all("SELECT * FROM stats", (err, stats) => {
    const statsObj = {};
    if (stats) {
      stats.forEach(stat => {
        statsObj[stat.stat_key] = stat.stat_value;
      });
    }
    res.render('admin/stats', { 
      stats: statsObj,
      title: 'Manage Stats',
      success: req.query.success
    });
  });
});


app.post('/admin/stats', requireAuth, (req, res) => {
  const updates = [
    { key: 'schools_supported', value: parseInt(req.body.schools_supported) || 0 },
    { key: 'students_helped', value: parseInt(req.body.students_helped) || 0 },
    { key: 'meals_served', value: parseInt(req.body.meals_served) || 0 },
    { key: 'communities_reached', value: parseInt(req.body.communities_reached) || 0 }
  ];
  
  let completed = 0;
  let hasError = false;
  
  updates.forEach(update => {
    // Use INSERT OR REPLACE to handle both insert and update cases
    db.run(`INSERT OR REPLACE INTO stats (stat_key, stat_value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [update.key, update.value], 
      (err) => {
        if (err) {
          console.error('Error updating stat:', update.key, err);
          hasError = true;
        }
        completed++;
        
        // Check if all updates are done
        if (completed === updates.length) {
          if (hasError) {
            res.redirect('/admin/stats?error=1');
          } else {
            console.log('Stats updated successfully');
            res.redirect('/admin/stats?success=1');
          }
        }
      }
    );
  });
});

// Add route to view access logs (admin only)
app.get('/admin/access-logs', requireAuth, (req, res) => {
  db.all("SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 100", (err, logs) => {
    res.render('admin/access-logs', { 
      logs: logs || [],
      title: 'Access Logs'
    });
  });
});

// Middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

app.listen(PORT, () => {
  console.log(`Weedagama Foundation website running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin/login`);
});

module.exports = app;