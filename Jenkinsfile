node {
    def app

    stage('Clone repository') {
        /* Let's make sure we have the repository cloned to our workspace */

        checkout scm
    }

    stage('Build image') {
        /* This builds the actual image; synonymous to
         * docker build on the command line */

        app = docker.build("ctrewe/rclone-two-way-sftp-gcs-sync:${env.BUILD_ID}")
    }

    stage('Push image') {
        docker.withRegistry('https://registry.hub.docker.com', 'docker-credentials') {

            // def customImage = docker.build("my-image:${env.BUILD_ID}")

            /* Push the container to the custom Registry */
            app.push()
        }
    }
}