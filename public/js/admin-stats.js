// public/js/admin-stats.js

document.addEventListener('DOMContentLoaded', function() {
    // Live preview update
    const schoolsInput = document.getElementById('schools_supported');
    const studentsInput = document.getElementById('students_helped');
    const mealsInput = document.getElementById('meals_served');
    const communitiesInput = document.getElementById('communities_reached');
    
    if (schoolsInput) {
        schoolsInput.addEventListener('input', function(e) {
            document.getElementById('preview-schools').textContent = parseInt(e.target.value || 0).toLocaleString();
        });
    }
    
    if (studentsInput) {
        studentsInput.addEventListener('input', function(e) {
            document.getElementById('preview-students').textContent = parseInt(e.target.value || 0).toLocaleString();
        });
    }
    
    if (mealsInput) {
        mealsInput.addEventListener('input', function(e) {
            document.getElementById('preview-meals').textContent = parseInt(e.target.value || 0).toLocaleString();
        });
    }
    
    if (communitiesInput) {
        communitiesInput.addEventListener('input', function(e) {
            document.getElementById('preview-communities').textContent = parseInt(e.target.value || 0).toLocaleString();
        });
    }
    
    // Override the form submission behavior for stats page
    const statsForm = document.querySelector('.stats-form');
    if (statsForm) {
        // Remove any existing submit handlers that might interfere
        const submitBtn = statsForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Clone the button to remove all event listeners
            const newSubmitBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
            
            // Add our own submit handler
            statsForm.addEventListener('submit', function(e) {
                const btn = this.querySelector('button[type="submit"]');
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
                    // Don't disable the button to allow form submission
                }
                // Allow the form to submit normally
                return true;
            });
        }
    }
});