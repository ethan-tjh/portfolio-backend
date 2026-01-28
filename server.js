const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
const port = 3000;
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
const allowedOrigins = [
    "http://localhost:3000",
]
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
}));
app.use(express.json());
app.listen(port, () => {
    console.log('Server running on port', port);
});
// GET
app.get('/projects', async (req, res) => {
    try {
        let connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM defaultdb.portfolio');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error for Projects'});
    }
});
// POST
app.post('/addProject', async (req, res) => {
    const {
        name,
        module_code = '',
        module_name = '',
        description = '',
        img = ''
    } = req.body;
    if (!name) {
        return res.status(400).json({message: 'Project name is required'});
    }
    try {
        let connection = await mysql.createConnection(dbConfig);
        await connection.execute('INSERT INTO portfolio (name, module_code, module_name, description, img) VALUES (?, ?, ?, ?, ?)', [name, module_code, module_name, description, img]);
        res.status(201).json({message: name + ' has been added successfully'});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error - could not add Project'});
    }
});
app.put('/updateProject/:id', async (req, res) => {
    const {id} = req.params;
    const {name, module_code, module_name, description, img} = req.body;
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
        values.push(img);
    }
    if (updates.length===0) {
        return res.status(400).json({message: 'No updates were found'});
    }
    try {
        let connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT name FROM portfolio WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({message: 'Project not found'});
        }
        const displayName = name || rows[0].name;
        values.push(id);
        const sql = `UPDATE portfolio SET ${updates.join(', ')} WHERE id = ?`;
        await connection.execute(sql, values);
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