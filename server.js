const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const port = process.env.PORT || 3000;
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 100,
    queueLimit: 0,
};

const app = express();
app.use(express.json());
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3000/",
    "http://localhost:5000",
    "http://localhost:5000/",
    "https://ethantjh-portfolio.vercel.app",
]
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.log('Blocked origin:', origin); // For Debugging
        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing auth" });
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "Invalid auth" });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Invalid/expired token" });
    }
}

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    family: 4,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify email transporter on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('Email transporter error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

app.listen(port, () => {
    console.log('Server running on port', port);
});

// GET
app.get('/projects', async (req, res) => {
    try {
        let connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM defaultdb.portfolio');
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error for Projects'});
    }
});
app.get('/categories', async (req, res) => {
    try {
        let connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT DISTINCT category FROM defaultdb.portfolio ORDER BY category');
        await connection.end();
        const categories = rows
            .map(row => row.category)
            .filter(cat => cat !== null && cat !== undefined && cat.trim() !== '');
        res.json(categories);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error for Categories'});
    }
});
app.get('/projects/:id/images', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [images] = await connection.execute(
      `SELECT id, image_url, sort_order, caption
       FROM defaultdb.portfolio_images
       WHERE portfolio_id = ?
       ORDER BY sort_order, id`,
      [id]
    );
    await connection.end();
    res.json(images);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving project images' });
  }
});
app.get('/projects/:id/tags', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [tags] = await connection.execute(
      `SELECT t.id, t.name
       FROM defaultdb.tags t
       INNER JOIN defaultdb.portfolio_tags pt ON pt.tag_id = t.id
       WHERE pt.portfolio_id = ?
       ORDER BY t.name`,
      [id]
    );
    await connection.end();
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving project tags' });
  }
});
// GET one project + thumbnail + category + images + tags
app.get('/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [projects] = await connection.execute(
      `SELECT * FROM defaultdb.portfolio WHERE id = ?`,
      [id]
    );
    if (projects.length === 0) {
      await connection.end();
      return res.status(404).json({ message: 'Project not found' });
    }
    const project = projects[0];
    const [images] = await connection.execute(
      `SELECT id, image_url, sort_order, caption
       FROM defaultdb.portfolio_images
       WHERE portfolio_id = ?
       ORDER BY sort_order, id`,
      [id]
    );
    const [tags] = await connection.execute(
      `SELECT t.id, t.name
       FROM defaultdb.tags t
       INNER JOIN defaultdb.portfolio_tags pt ON pt.tag_id = t.id
       WHERE pt.portfolio_id = ?
       ORDER BY t.name`,
      [id]
    );
    await connection.end();
    res.json({
      ...project,     // includes img (thumbnail) + category
      images,         // additional images
      tags            // tag list
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving project detail' });
  }
});
// GET all technologies grouped by category (for your skills/tech table)
app.get('/skills', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      `SELECT id, name, skill_category
       FROM defaultdb.tags
       ORDER BY skill_category, name`
    );
    await connection.end();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving skills' });
  }
});

// POST
app.post('/login', async (req, res) => {
    const {username, password} = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT * FROM defaultdb.admin WHERE username = ?', 
            [username]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const admin = rows[0];
        const valid = await bcrypt.compare(password, admin.password_hash);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ userId: admin.id }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});
app.post('/addProject', async (req, res) => {
    const {
        name,
        module_code = '',
        module_name = '',
        description = '',
        img = '',
        category = '',
        github_link = '',
        demo_link = '',
        additional_images: [],
    } = req.body;
    if (!name) {
        return res.status(400).json({message: 'Project name is required'});
    }
    try {
        let connection = await mysql.createConnection(dbConfig);
        // Insert project
        const [result] = await connection.execute(
            'INSERT INTO portfolio (name, module_code, module_name, description, img, category, github_link, demo_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [name, module_code, module_name, description, img || null, category || null, github_link || null, demo_link || null]
        );
        const projectId = result.insertId;
        // Insert additional images if provided
        if (additional_images && additional_images.length > 0) {
            for (let i = 0; i < additional_images.length; i++) {
                await connection.execute(
                    'INSERT INTO portfolio_images (portfolio_id, image_url, sort_order) VALUES (?, ?, ?)',
                    [projectId, additional_images[i], i + 1]
                );
            }
        }
        await connection.end();
        res.status(201).json({message: name + ' has been added successfully'});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error - could not add Project'});
    }
});
app.put('/updateProject/:id', async (req, res) => {
    const {id} = req.params;
    const {name, module_code, module_name, description, img, category, github_link, demo_link, additional_images} = req.body;
    if (!id) {
        return res.status(400).json({message: 'Id must be provided'});
    }
    const updates = [];
    const values = [];
    if (name!==undefined) {
        updates.push('name = ?');
        values.push(name);
    }
    if (module_code!==undefined) {
        updates.push('module_code = ?');
        values.push(module_code);
    }
    if (module_name!==undefined) {
        updates.push('module_name = ?');
        values.push(module_name);
    }
    if (description!==undefined) {
        updates.push('description = ?');
        values.push(description);
    }
    if (img!==undefined) {
        updates.push('img = ?');
        values.push(img || null);
    }
    if (category!==undefined) {
        updates.push('category = ?');
        values.push(category || null);
    }
    if (github_link!==undefined) {
        updates.push('github_link = ?');
        values.push(github_link || null);
    }
    if (demo_link!==undefined) {
        updates.push('demo_link = ?');
        values.push(demo_link || null);
    }
    if (updates.length===0 && !additional_images) {
        return res.status(400).json({message: 'No updates were found'});
    }
    try {
        let connection = await mysql.createConnection(dbConfig);
        if (updates.length > 0) {
            const [rows] = await connection.execute('SELECT name FROM portfolio WHERE id = ?', [id]);
            if (rows.length === 0) {
                await connection.end();
                return res.status(404).json({message: 'Project not found'});
            }
            const displayName = name || rows[0].name;
            values.push(id);
            const sql = `UPDATE portfolio SET ${updates.join(', ')} WHERE id = ?`;
            await connection.execute(sql, values);
        }
        if (additional_images !== undefined) {
            // Delete existing images for this project
            await connection.execute('DELETE FROM defaultdb.portfolio_images WHERE portfolio_id = ?', [id]);
            // Insert new images if any
            if (additional_images.length > 0) {
                for (let i = 0; i < additional_images.length; i++) {
                    await connection.execute(
                        'INSERT INTO defaultdb.portfolio_images (portfolio_id, image_url, sort_order) VALUES (?, ?, ?)',
                        [id, additional_images[i], i + 1]
                    );
                }
            }
        }
        await connection.end();
        res.status(200).json({message: displayName + ' was updated successfully'});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error - could not update Project'});
    }
});
app.delete('/deleteProject/:id', async (req, res) => {
    const {id} = req.params;
    try {
        let connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT name FROM portfolio WHERE id = ?', [id]);
        const displayName = rows[0].name;
        await connection.execute('DELETE FROM portfolio WHERE id = ?', [id]);
        res.status(200).json({message: displayName + ' has been deleted'});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error - could not delete Project'});
    }
});
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    // Validate required fields
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    try {
        // Email to you (site owner)
        const mailToOwner = {
            from: `"Portfolio Contact" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_RECEIVER || process.env.EMAIL_USER,
            replyTo: email,
            subject: `Portfolio Contact: ${subject}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #F2A2C0, #4CB3FF); padding: 30px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: #1E2333; margin: 0; font-size: 24px;">New Contact Form Submission</h1>
                    </div>
                    <div style="background-color: #F6F7FB; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">
                        <div style="margin-bottom: 20px;">
                            <p style="color: #66708A; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">From</p>
                            <p style="color: #1E2333; margin: 0; font-size: 16px; font-weight: 500;">${name}</p>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <p style="color: #66708A; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Email</p>
                            <p style="color: #1E2333; margin: 0; font-size: 16px;"><a href="mailto:${email}" style="color: #4CB3FF;">${email}</a></p>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <p style="color: #66708A; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Subject</p>
                            <p style="color: #1E2333; margin: 0; font-size: 16px; font-weight: 500;">${subject}</p>
                        </div>
                        <div style="margin-bottom: 0;">
                            <p style="color: #66708A; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Message</p>
                            <div style="background-color: #FFFFFF; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;">
                                <p style="color: #3B4256; margin: 0; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        };
        // Confirmation email to sender
        const mailToSender = {
            from: `"Ethan Tan" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Thanks for reaching out, ${name}!`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #F2A2C0, #4CB3FF); padding: 30px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: #1E2333; margin: 0; font-size: 24px;">Message Received! ✨</h1>
                    </div>
                    <div style="background-color: #F6F7FB; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">
                        <p style="color: #3B4256; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Hi ${name},
                        </p>
                        <p style="color: #3B4256; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Thank you for getting in touch! I've received your message and will get back to you as soon as possible.
                        </p>
                        <p style="color: #3B4256; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            In the meantime, feel free to check out my latest work on my portfolio.
                        </p>
                        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0; margin-bottom: 20px;">
                            <p style="color: #66708A; margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your message:</p>
                            <p style="color: #3B4256; margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${message}</p>
                        </div>
                        <p style="color: #3B4256; font-size: 16px; line-height: 1.6; margin: 0;">
                            Best regards,<br>
                            <strong>Your Name</strong>
                        </p>
                    </div>
                </div>
            `
        };
        // Send email to owner
        await transporter.sendMail(mailToOwner);
        // Send confirmation to sender
        await transporter.sendMail(mailToSender);
        res.status(200).json({ 
            success: true, 
            message: 'Email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            error: 'Failed to send email. Please try again later.' 
        });
    }
});