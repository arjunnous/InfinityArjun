@echo off
echo.
echo ===================================
echo  Testing PostgreSQL DB Connection
echo ===================================
echo.

node -e ^
"require('dotenv').config();" ^
"require('dotenv').config({path:'.env.qa',override:true});" ^
"const {Client}=require('pg');" ^
"const c=new Client({" ^
"  host:process.env.DB_HOST," ^
"  port:parseInt(process.env.DB_PORT||'5432')," ^
"  database:process.env.DB_NAME," ^
"  user:process.env.DB_USER," ^
"  password:process.env.DB_PASSWORD," ^
"  ssl:{rejectUnauthorized:false}" ^
"});" ^
"console.log('Host     : ' + process.env.DB_HOST);" ^
"console.log('Database : ' + process.env.DB_NAME);" ^
"console.log('User     : ' + process.env.DB_USER);" ^
"console.log('');" ^
"c.connect()" ^
"  .then(()=>c.query('SELECT current_database() AS db, current_user AS usr, version() AS ver'))" ^
"  .then(r=>{" ^
"    console.log('=== CONNECTION SUCCESS ===');" ^
"    console.log('Database : ' + r.rows[0].db);" ^
"    console.log('User     : ' + r.rows[0].usr);" ^
"    console.log('Version  : ' + r.rows[0].ver.split(',')[0]);" ^
"    c.end();" ^
"  })" ^
"  .catch(e=>{" ^
"    console.error('=== CONNECTION FAILED ===');" ^
"    console.error('Error    : ' + e.message);" ^
"    c.end();" ^
"    process.exit(1);" ^
"  });"

echo.
