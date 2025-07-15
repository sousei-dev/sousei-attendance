#!/bin/bash

# Build the application
echo "Building the application..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "Build successful!"
    
    # Copy .htaccess to dist folder
    if [ -f "public/.htaccess" ]; then
        cp public/.htaccess dist/
        echo "Copied .htaccess to dist folder"
    fi
    
    echo "Deployment ready! Upload the contents of the 'dist' folder to your web server."
else
    echo "Build failed!"
    exit 1
fi 