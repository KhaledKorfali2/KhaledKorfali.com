function goToProjects() {
	window.location.href = "projects.html";
}

// List of projects 
const projects = [
	{name: "Falling-Sand", image: "screenshots/placeholder.png", path: "Projects/Falling-Sand/index.html"}

];

// Dynamically genearte project grid
document.addEventListener("DOMContentLoaded", function() {
	const gridContainer = document.getElementById("projectsGrid");
	if (!gridContainer) return;

	projects.forEach(project => {
		const projectDiv = document.createElement("div");
		projectDiv.classList.add("grid-item");

		projectDiv.innerHTML = `
            <a href="${project.demo}">
                <img src="${project.image}" alt="${project.name}">
                <p>${project.name}</p>
            </a>
        `;
		gridContainer.appendChild(projectDiv);
	});

});