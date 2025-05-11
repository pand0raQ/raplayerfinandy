#!/bin/bash

# Repository name
REPO_NAME="trading-bot-server"
REPO_DESC="Server to handle trading strategy signals from Telegram bot"

# Set GitHub username
USERNAME="pand0ra_q"

# Read GitHub token (without displaying in terminal)
echo "Enter your GitHub Personal Access Token (PAT):"
read -s TOKEN

echo "Creating repository $REPO_NAME..."

# Create the repository
curl -H "Authorization: token $TOKEN" \
     -d "{\"name\":\"$REPO_NAME\",\"description\":\"$REPO_DESC\",\"private\":false}" \
     https://api.github.com/user/repos

if [ $? -eq 0 ]; then
    echo "Repository created successfully!"
    
    # Configure local repository with remote
    git remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"
    
    # Push your code to the repository
    echo "Pushing code to the repository..."
    git push -u origin main
    
    echo "Done! Your repository is now available at: https://github.com/$USERNAME/$REPO_NAME"
else
    echo "Failed to create repository. Check your credentials and try again."
fi 