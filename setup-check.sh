#!/bin/bash

# X1 Analytics - Environment Setup & Debug Script

echo "🔍 X1 Analytics Environment Checker"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in project root directory"
    echo "   Please run this from your X1-Analytics folder"
    exit 1
fi

echo "✅ Found package.json"
echo ""

# Check for .env.local
echo "📝 Checking environment files..."
if [ ! -f ".env.local" ]; then
    echo "❌ Missing .env.local file!"
    echo ""
    echo "Creating .env.local template..."
    cat > .env.local << 'EOF'
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Cron Secret (generate a random string)
CRON_SECRET=your-secret-here

# Optional: X1 RPC
X1_RPC_URL=https://x1-testnet.infrared.dev
EOF
    echo "✅ Created .env.local template"
    echo ""
    echo "⚠️  ACTION REQUIRED:"
    echo "   1. Go to: https://supabase.com/dashboard"
    echo "   2. Select your project → Settings → API"
    echo "   3. Copy 'Project URL' and 'service_role' key"
    echo "   4. Update .env.local with your actual values"
    echo "   5. Generate a random CRON_SECRET"
    echo ""
else
    echo "✅ Found .env.local"
    echo ""
    
    # Check if vars are set
    source .env.local 2>/dev/null
    
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ "$NEXT_PUBLIC_SUPABASE_URL" = "https://YOUR_PROJECT.supabase.co" ]; then
        echo "⚠️  NEXT_PUBLIC_SUPABASE_URL not configured properly"
    else
        echo "✅ NEXT_PUBLIC_SUPABASE_URL is set"
    fi
    
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ "$SUPABASE_SERVICE_ROLE_KEY" = "your-service-role-key-here" ]; then
        echo "❌ SUPABASE_SERVICE_ROLE_KEY not configured!"
        echo "   This is why you're getting 'Invalid API key' error"
    else
        echo "✅ SUPABASE_SERVICE_ROLE_KEY is set"
    fi
    
    if [ -z "$CRON_SECRET" ] || [ "$CRON_SECRET" = "your-secret-here" ]; then
        echo "⚠️  CRON_SECRET not configured"
    else
        echo "✅ CRON_SECRET is set"
    fi
fi

echo ""
echo "📁 Checking project structure..."

# Check for required directories/files
if [ ! -d "app/api/candles" ]; then
    echo "⚠️  Missing app/api/candles directory"
    echo "   Creating it now..."
    mkdir -p app/api/candles
    echo "✅ Created app/api/candles"
fi

if [ ! -f "app/api/candles/route.ts" ]; then
    echo "❌ Missing app/api/candles/route.ts"
    echo "   This endpoint is needed for the frontend!"
fi

if [ ! -d "lib" ]; then
    echo "⚠️  Missing lib directory"
    mkdir -p lib
    echo "✅ Created lib"
fi

echo ""
echo "🔧 Next Steps:"
echo ""
echo "1. Update .env.local with your actual Supabase credentials"
echo "2. Make sure you have app/api/candles/route.ts (GET endpoint)"
echo "3. Restart your dev server:"
echo "   pkill -f next && npm run dev"
echo ""
echo "4. Test the API:"
echo "   curl http://localhost:3000/api/candles?pool=YOUR_POOL&tf=5m&limit=2"
echo ""

# Check if server is running
if pgrep -f "next dev" > /dev/null; then
    echo "⚠️  Next.js dev server is currently running"
    echo "   Remember to restart it after updating .env.local!"
fi

echo ""
echo "Done! 🎉"
