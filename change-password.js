// change-password.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Get new password from command line argument
const newPassword = process.argv[2];

if (!newPassword) {
  console.error('Usage: node change-password.js <new-password>');
  console.log('Example: node change-password.js myNewSecurePassword123');
  process.exit(1);
}

// Connect to database
const db = new sqlite3.Database('foundation.db');

// Hash the new password
bcrypt.hash(newPassword, 10, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }

  // Update the admin password
  db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hash], function(err) {
    if (err) {
      console.error('Error updating password:', err);
      return;
    }

    if (this.changes === 0) {
      console.log('No admin user found. Creating new admin user...');
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
        ['admin', hash, 'admin'], (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('✅ Admin user created successfully!');
            console.log('Username: admin');
            console.log('Password:', newPassword);
          }
          db.close();
        });
    } else {
      console.log('✅ Admin password updated successfully!');
      console.log('Username: admin');
      console.log('Password:', newPassword);
      db.close();
    }
  });
});