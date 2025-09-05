import React from "react";
import { Link } from "react-router";

export default function Navbar() {
	return (
		<nav className="navbar">
			<Link to="/">
				<p className="text-gradient text-2xl font-bold">Resumind</p>
			</Link>
			<div className="flex gap-4">
				<Link to="/upload" className="primary-button w-fit">Upload Resume</Link>
				<Link to="/wipe" className="border border-red-500 text-red-500 hover:bg-red-500 hover:text-white rounded-full px-4 py-2 cursor-pointer transition-all">Manage Data</Link>
			</div>
		</nav>
	);
}
