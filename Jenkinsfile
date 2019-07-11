node {
    def app
    // def buildCancelled = false

    stage('Log variables') {
        /* Let's make sure we have the repository cloned to our workspace */

        sh 'printenv'
    }

    stage('Clone repository') {
        /* Let's make sure we have the repository cloned to our workspace */

        checkout scm
    }

    stage('Build image') {
        /* This builds the actual image; synonymous to
         * docker build on the command line */

        def version = ''
        if (${env.BRANCH_NAME} == "develop") {
            version = 'latest-dev'
        } else if (${env.BRANCH_NAME} == "master") {
            version = 'latest'
        }else {
            return 'test'
        }
        app = docker.build("ctrewe/rclone-two-way-sftp-gcs-sync:${version}")
    }

    stage('Push image') {
        docker.withRegistry('https://registry.hub.docker.com', 'docker-credentials') {
            app.push()
        }
    }
}

// def getVersion() {
//     if (${env.BRANCH_NAME} == "develop") {
//         return 'latest-dev'
//     }
//     if (${env.BRANCH_NAME} == "master") {
//         return 'latest'
//     }
//     else {
//         buildCancelled = true
//         return 'test'
//     }
// }

// def printParams() {
//     env.getEnvironment().each { name, value -> println "Name: $name -> Value $value" }
// }
