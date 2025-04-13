#!/bin/bash

# Apply the migration to Supabase
echo "Applying the rewards table migration to Supabase..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI is not installed. Install it first with:"
    echo "npm install -g supabase"
    exit 1
fi

# Apply the migration
supabase migration up

echo "Migration applied successfully!"
echo ""
echo "If you're using a remote Supabase instance, make sure to deploy the migration:"
echo "supabase db push" 