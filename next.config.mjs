const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns = [];

if (supabaseUrl) {
	const { protocol, hostname, port } = new URL(supabaseUrl);

	remotePatterns.push({
		protocol: protocol.replace(":", ""),
		hostname,
		port: port || undefined,
		pathname: "/storage/v1/object/**",
	});
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns,
	},
};

export default nextConfig;
